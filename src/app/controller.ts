import {
  CARDS, CARD_IDS, CATEGORIES, categoryMask, type ActionId, type CardId, type Category, type CssNet, type CssNetMode, type SmartWebTestHook, type Verb,
} from '../cssnet/contract'
import { SHAPE } from '../model/config'
import { ModelClient } from '../model/client'
import { fragmentParam } from '../model/quantize'
import type { ModelEvent, ModelSnapshot, ModelStats, Orders, PersistedModel } from '../model/types'
import { FeatureExtractor, attachDomListeners } from '../signals/extractor'
import { selectModelFeatures } from '../signals/features'
import { MIN_EVIDENCE, blendScores, defaultOrders, movedCards, reorder, reorderBy, swapMargin } from './adaptive'
import { NAV_ACTION } from './catalog'
import { isProbVector, loadCssNetModule, mountNet, type CssNetModule } from './cssnetBridge'
import { generateJourney, stepTestId, synthesizeStep } from './replay'

const LATENCY_KEEP = 100

const idle = (fn: () => void): number =>
  typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 250 }) : (setTimeout(fn, 30) as unknown as number)
const cancelIdle = (h: number) => (typeof cancelIdleCallback === 'function' ? cancelIdleCallback(h) : clearTimeout(h))

/** Test-only extras on window.__smartweb, beyond the contract's SmartWebTestHook. */
export interface SmartWebTestExtras {
  netSource(): 'cssnet' | 'fallback' | 'none'
  /** Hidden activations read back from the CSS net. */
  hidden(): number[]
  /** Current MLP weights (row-major, as the contract's NetWeights). */
  weights(): { W1: number[]; b1: number[]; W2: number[]; b2: number[] } | null
  /** Blended score per card (18). */
  scores(): number[]
  /** CSS outputs of every category's net (18; each category from its own net and context). */
  cssAll(): number[]
  /** JS reference for every category in its own context (18), to check cssAll. */
  jsAll(): number[]
  benchmark(): AppState['benchmark']
  affinity(): number[]
  evidence(): Record<Category, number>
  alpha(): number
  orders(): Orders
  /** Sidebar category order. */
  navOrder(): Category[]
  /** Double-rAF latencies (ms, same t0 as latencies()); an upper bound kept for comparison. */
  latenciesDoubleRaf(): number[]
  /** Resolves when all queued model work has been applied. */
  idle(): Promise<void>
}

/** How a snapshot may change the layout. */
type Adapt = 'none' | 'live' | 'entry' | 'all'

export interface AppState {
  ready: boolean
  mode: CssNetMode
  netSource: 'cssnet' | 'fallback' | 'none'
  jsForwardSource: string
  workerKind: 'worker' | 'local'
  category: Category
  orders: Orders
  /** Cards that changed slot in the last reorder (for a brief highlight). */
  moved: CardId[]
  /** Increments whenever an order changes (keys the highlight). */
  orderVersion: number
  scores: number[]
  affinity: number[]
  evidence: Record<Category, number>
  mlpWorker: number[]
  css: number[]
  js: number[]
  hidden: number[]
  cssJsMaxDiff: number
  cssValid: boolean
  alpha: number
  x: number[]
  raw: number[]
  stats: ModelStats
  /** CSS outputs for all 18 cards, each category computed by its own net (others refresh when idle). */
  cssAll: number[]
  /** Ranking quality after each counted press (session). */
  history: { n: number; shown: number; affinity: number; mlp: number }[]
  /** Category order in the sidebar (learned, same hysteresis as cards). */
  navOrder: Category[]
  categoryScores: number[]
  /** Model size, measured on demand (Model page). */
  modelSize: { params: number; float32Bytes: number; jsonBytes: number; linkBytes: number } | null
  /** In-browser engine benchmark (run on demand). */
  benchmark: { mode: CssNetMode; usPerEval: number; usWithNodes: number; maxDiff: number; evals: number }[] | null
  benchmarking: boolean
  /** Last presses, newest first (session). */
  activity: (ModelEvent & { at: number })[]
  /** Engagements per card this session. */
  engaged: Partial<Record<CardId, number>>
  favorites: Partial<Record<CardId, boolean>>
  latencies: number[]
  latenciesDoubleRaf: number[]
  replaying: boolean
  messages: string[]
  shareLink: string | null
  version: number
}

const zeros = (n: number) => new Array(n).fill(0)
const noEvidence = () => Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>

function initialState(): AppState {
  return {
    ready: false, mode: 'calc', netSource: 'none', jsForwardSource: 'local', workerKind: 'local',
    category: 'home', orders: defaultOrders(), moved: [], orderVersion: 0,
    scores: zeros(SHAPE.outputs), affinity: zeros(SHAPE.outputs), evidence: noEvidence(), mlpWorker: zeros(SHAPE.outputs),
    css: zeros(SHAPE.outputs), js: zeros(SHAPE.outputs), hidden: zeros(SHAPE.hidden), cssJsMaxDiff: 0, cssValid: true, alpha: 0,
    x: zeros(SHAPE.inputs), raw: [], stats: { examples: 0, affinityAcc: 0, mlpAcc: 0, blendAcc: 0, accN: 0 },
    cssAll: zeros(SHAPE.outputs), history: [], activity: [], benchmark: null, benchmarking: false,
    navOrder: [...CATEGORIES], categoryScores: [1 / 3, 1 / 3, 1 / 3], modelSize: null,
    engaged: {}, favorites: {}, latencies: [], latenciesDoubleRaf: [], replaying: false, messages: [], shareLink: null, version: 0,
  }
}

export class SmartWebController {
  state: AppState = initialState()
  private listeners = new Set<() => void>()
  private fx = new FeatureExtractor(performance.now(), { width: typeof window !== 'undefined' ? window.innerWidth : 1280 })
  private client: ModelClient | null = null
  private mod: CssNetModule | null = null
  /** One CSS net per category; `net` is the current category's. */
  private nets: Partial<Record<Category, CssNet>> = {}
  private scopes: Partial<Record<Category, HTMLElement>> = {}
  private get net(): CssNet | null { return this.nets[this.state.category] ?? null }
  private host: HTMLElement | null = null
  private idleHandle: number | null = null
  /** A press is down, or (since this time) an interaction's update has not reached a frame yet. */
  private pressing = false
  private awaitingFrameSince: number | null = null
  /** Latency samples live outside React state: recording one must not cause a render. */
  private lat: number[] = []
  private latDbl: number[] = []
  /** UI-only changes from a press, folded into the next model update's render. */
  private pendingPatch: Partial<AppState> = {}
  private snap: ModelSnapshot | null = null
  private detach: (() => void) | null = null
  private chain: Promise<unknown> = Promise.resolve()
  private pendingLatencyT0: number | null = null
  private started = false
  private readonly makeClient: () => ModelClient

  constructor(opts: { makeClient?: () => ModelClient } = {}) {
    this.makeClient = opts.makeClient ?? (() => new ModelClient())
  }

  /** Live MLP weights for visualisation (row-major per contract). */
  currentWeights() { return this.snap?.weights ?? null }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  getState = () => this.state

  private set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 }
    this.listeners.forEach((l) => l())
  }

  private log(msg: string) {
    this.set({ messages: [...this.state.messages.slice(-7), msg] })
  }

  /** Serialise async work so training steps land in interaction order. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn)
    this.chain = p.catch((e) => this.log(`error: ${(e as Error).message}`))
    return p
  }

  async start(host: HTMLElement): Promise<void> {
    if (this.started) return
    this.started = true
    this.host = host
    const detachFx = attachDomListeners(this.fx)
    const down = () => { this.pressing = true }
    const up = () => { this.pressing = false }
    addEventListener('pointerdown', down, true)
    addEventListener('pointerup', up, true)
    addEventListener('pointercancel', up, true)
    this.detach = () => { detachFx(); removeEventListener('pointerdown', down, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true) }
    this.installHook()
    if (navigator.storage?.persist) {
      navigator.storage.persist().then((ok) => this.log(`storage.persist(): ${ok}`)).catch(() => undefined)
    }
    // Never lose the last interaction to the 1 s save debounce.
    const flush = () => { void this.client?.flush() }
    addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
    this.mod = await loadCssNetModule()
    this.mod.errors.forEach((e) => this.log(e))
    const source = this.mountAll(this.state.mode)
    this.client = this.makeClient()
    const fragment = typeof location !== 'undefined' ? fragmentParam(location.hash) : null
    const raw = this.fx.idle()
    const r = await this.enqueue(() => this.client!.init(selectModelFeatures(raw), this.state.category, fragment))
    if (r.error) this.log(r.error)
    if (r.source === 'fragment') {
      this.log('model imported from URL fragment')
      history.replaceState(null, '', location.pathname + location.search)
    } else if (r.source === 'idb') this.log('model restored from IndexedDB')
    this.set({ ready: true, netSource: source, jsForwardSource: this.mod.jsForwardSource, workerKind: this.client.kind, raw: Array.from(raw) })
    // On load: restore the saved orders, then bring every category up to date.
    if (r.snapshot.orders) this.set({ orders: r.snapshot.orders })
    if (r.snapshot.navOrder) this.set({ navOrder: r.snapshot.navOrder })
    this.apply(r.snapshot, 'all')
  }

  /** Mount one net per category, each in its own scope element under the host. */
  private mountAll(mode: CssNetMode): 'cssnet' | 'fallback' {
    if (!this.host || !this.mod) return 'fallback'
    let source: 'cssnet' | 'fallback' = 'cssnet'
    for (const c of CATEGORIES) {
      this.nets[c]?.destroy()
      let scope = this.scopes[c]
      if (!scope) {
        scope = document.createElement('div')
        scope.dataset.netScope = c
        scope.style.cssText = 'position:absolute;inset:0;pointer-events:none'
        this.host.appendChild(scope)
        this.scopes[c] = scope
      }
      // Rendered while mounting: the mount probe reads computed values (see refreshOthers).
      scope.toggleAttribute('data-refreshing', true)
      const m = mountNet(this.mod, scope, SHAPE, mode, { nodeOutputs: CARD_IDS.map((_, i) => i).filter((i) => categoryMask(c)[i]) })
      scope.toggleAttribute('data-refreshing', false)
      if (m.error) this.log(m.error)
      if (m.source === 'fallback') source = 'fallback'
      this.nets[c] = m.net
    }
    this.markActiveScope()
    return source
  }

  private markActiveScope() {
    for (const c of CATEGORIES) this.scopes[c]?.toggleAttribute('data-active', c === this.state.category)
  }

  /** Recompute the other categories' nets off the click path. */
  private refreshOthers(s: ModelSnapshot) {
    const run = () => {
      this.idleHandle = null
      // Never between a press and the frame that shows its result: an idle callback can run in
      // the gap while the click waits for the worker, and this refresh (two forced style passes
      // plus a re-render) would land on the click path. Wait for the press to finish and its
      // frame to be produced (bounded, in case an interaction never commits).
      const waiting = this.awaitingFrameSince !== null && performance.now() - this.awaitingFrameSince < 1000
      if (this.pressing || waiting) { this.idleHandle = idle(run); return }
      const all = [...this.state.cssAll]
      for (const c of CATEGORIES) {
        if (c === this.state.category) continue
        const net = this.nets[c]
        if (!net) continue
        const mask = categoryMask(c)
        // Shown for the duration of the read: idle scopes are display:none while the model card
        // is offscreen (see index.css), and CSS animations only run on rendered elements.
        const scope = this.scopes[c]
        scope?.toggleAttribute('data-refreshing', true)
        try {
          net.setWeights(s.weights)
          net.setInputs(Float32Array.from(s.xByCategory[c]), mask)
          const out = net.readOutputs()
          CARD_IDS.forEach((_, i) => { if (mask[i]) all[i] = out[i] })
        } catch (e) { this.log(`css net error: ${(e as Error).message}`) }
        finally { scope?.toggleAttribute('data-refreshing', false) }
      }
      this.set({ cssAll: all })
    }
    if (this.idleHandle !== null) cancelIdle(this.idleHandle)
    this.idleHandle = idle(run)
  }

  stop(): void {
    this.detach?.()
    for (const c of CATEGORIES) this.nets[c]?.destroy()
    this.client?.terminate()
    this.started = false
  }

  /**
   * Push a snapshot through the CSS net (current category, masked) and recompute the order.
   * The current category is ordered from the CSS-computed MLP output; other categories use
   * the worker's JS forward of their own context (the CSS net computes one category at a time).
   */
  private apply(s: ModelSnapshot, adapt: Adapt): void {
    this.snap = s
    const c = this.state.category
    const mask = categoryMask(c)
    const x = Float32Array.from(s.xByCategory[c])
    let css: Float32Array = s.mlp
    let hidden: Float32Array = new Float32Array(SHAPE.hidden)
    let cssValid = false
    if (this.net) {
      try {
        this.net.setWeights(s.weights)
        this.net.setInputs(x, mask)
        css = this.net.readOutputs()
        hidden = this.net.readHidden()
        cssValid = isProbVector(css, SHAPE.outputs)
      } catch (e) {
        this.log(`css net error: ${(e as Error).message}`)
      }
    }
    const js = this.mod ? this.mod.jsForward(SHAPE, s.weights, x, mask).out : s.mlp
    let maxDiff = 0
    for (let i = 0; i < SHAPE.outputs; i++) if (mask[i]) maxDiff = Math.max(maxDiff, Math.abs((css[i] ?? NaN) - js[i]))
    const mlp = Array.from(s.mlp)
    if (cssValid) CARD_IDS.forEach((_, i) => { if (mask[i]) mlp[i] = css[i] })
    const scores = blendScores(s.affinity, mlp, s.alpha)

    const orders = { ...this.state.orders }
    let moved: CardId[] = []
    const cats = adapt === 'all' ? CATEGORIES : adapt === 'none' ? [] : [c]
    for (const k of cats) {
      if (s.evidence[k] < MIN_EVIDENCE) continue
      const next = reorder(orders[k], scores, swapMargin(s.evidence[k]))
      if (k === c) moved = movedCards(orders[k], next)
      orders[k] = next
    }
    const changed = CATEGORIES.some((k) => orders[k].join() !== this.state.orders[k].join())
    // The sidebar's categories are ordered the same way, from category-level usage.
    let navOrder = this.state.navOrder
    if (adapt !== 'none' && s.categoryEvidence >= MIN_EVIDENCE) {
      navOrder = reorderBy(navOrder, (k) => s.categoryScores[CATEGORIES.indexOf(k)], swapMargin(s.categoryEvidence))
    }
    const navChanged = navOrder.join() !== this.state.navOrder.join()
    if (changed || navChanged) void this.client?.setOrders(orders, navOrder)
    const cssAll = [...this.state.cssAll]
    CARD_IDS.forEach((_, i) => { if (mask[i]) cssAll[i] = cssValid ? css[i] : s.mlp[i] })
    const ev = s.lastEvent
    const history = ev?.counted
      ? [...this.state.history, { n: s.stats.examples, shown: s.stats.blendAcc, affinity: s.stats.affinityAcc, mlp: s.stats.mlpAcc }].slice(-200)
      : this.state.history
    const activity = ev ? [{ ...ev, at: Date.now() }, ...this.state.activity].slice(0, 10) : this.state.activity

    this.set({
      orders, moved: changed ? moved : this.state.moved, orderVersion: this.state.orderVersion + (changed ? 1 : 0), scores, affinity: Array.from(s.affinity), evidence: s.evidence, mlpWorker: Array.from(s.mlp),
      css: Array.from(css), js: Array.from(js), hidden: Array.from(hidden), cssJsMaxDiff: maxDiff, cssValid,
      alpha: s.alpha, x: Array.from(x), stats: s.stats, cssAll, history, activity,
      navOrder, categoryScores: s.categoryScores,
      latencies: this.lat, latenciesDoubleRaf: this.latDbl, ...this.pendingPatch,
    })
    this.pendingPatch = {}
    this.refreshOthers(s)
  }

  private latencyStart(now: number, t0?: number) {
    // Click-to-pixel starts at pointerup for presses (react-aria onPress fires on release), else now.
    return t0 ?? this.fx.lastReleaseTime(now, 400) ?? now
  }

  /** Switch category: the learned order for that category is applied on entry. */
  enter(category: Category, opts: { t?: number; t0?: number } = {}): Promise<void> {
    const now = performance.now()
    const t = opts.t ?? now
    const t0 = this.latencyStart(now, opts.t0)
    this.awaitingFrameSince = now
    const raw = this.fx.snapshot(NAV_ACTION[category], t)
    this.set({ category, moved: [] })
    this.markActiveScope()
    return this.enqueue(async () => {
      if (!this.client) return
      const s = await this.client.visit(selectModelFeatures(raw), category, t)
      this.pendingLatencyT0 = t0
      this.apply(s, 'entry')
    })
  }

  /** The user engaged a card in the current category: train, then re-sort the category live. */
  engage(card: CardId, verb: Verb, opts: { t?: number; t0?: number; category?: Category } = {}): Promise<void> {
    const now = performance.now()
    const t = opts.t ?? now
    const t0 = this.latencyStart(now, opts.t0)
    this.awaitingFrameSince = now
    const raw = this.fx.snapshot(verb as ActionId, t)
    const category = opts.category ?? this.state.category
    const engaged = { ...this.state.engaged, [card]: (this.state.engaged[card] ?? 0) + 1 }
    const favorites = verb === 'favorite' ? { ...this.state.favorites, [card]: !this.state.favorites[card] } : this.state.favorites
    this.pendingPatch = { ...this.pendingPatch, engaged, favorites }
    // Keep state current for reads before the model answers (renders happen with the update).
    this.state = { ...this.state, engaged, favorites }
    return this.enqueue(async () => {
      if (!this.client) return
      const s = await this.client.step(selectModelFeatures(raw), card, verb, category, t)
      this.pendingLatencyT0 = t0
      this.set({ raw: Array.from(raw) })
      this.apply(s, 'live')
    })
  }

  /** Picked a card in the search palette: go to its category, then learn it as explicit intent. */
  async searchPick(card: CardId): Promise<void> {
    const cat = CARDS[CARD_IDS.indexOf(card)].category as Category
    if (cat !== this.state.category) await this.enter(cat)
    await this.engage(card, 'search')
  }

  /** Closed the palette after a query without picking: the top match gets a small interest signal. */
  searchAbandon(card: CardId): Promise<void> {
    return this.engage(card, 'query', { category: CARDS[CARD_IDS.indexOf(card)].category as Category })
  }

  /**
   * Called by the UI after React committed a state version. Click-to-pixel ends when the
   * frame containing that commit has been produced: a rAF callback runs just before the
   * frame's paint, and a message posted from it runs right after that frame (standard
   * "next paint" approximation). The double-rAF number is kept as an upper bound.
   */
  committed(): void {
    const t0 = this.pendingLatencyT0
    if (t0 === null) return
    this.pendingLatencyT0 = null
    requestAnimationFrame(() => {
      const ch = new MessageChannel()
      ch.port1.onmessage = () => {
        const ms = performance.now() - t0
        this.lat = [...this.lat, ms].slice(-LATENCY_KEEP)
        this.awaitingFrameSince = null
        ch.port1.close()
      }
      ch.port2.postMessage(0)
      requestAnimationFrame(() => {
        const ms = performance.now() - t0
        this.latDbl = [...this.latDbl, ms].slice(-LATENCY_KEEP)
      })
    })
  }

  setMode(mode: CssNetMode): void {
    if (mode === this.state.mode && this.net) return
    this.set({ mode })
    if (!this.host || !this.mod) return
    this.set({ netSource: this.mountAll(mode) })
    if (this.snap) this.apply(this.snap, 'none')
  }

  reset(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.client) return
      const s = await this.client.reset(selectModelFeatures(this.fx.idle()), this.state.category)
      this.lat = []; this.latDbl = []
      this.set({ orders: defaultOrders(), navOrder: [...CATEGORIES], moved: [], latencies: [], latenciesDoubleRaf: [], engaged: {}, favorites: {}, history: [], activity: [] })
      this.apply(s, 'none')
      this.log('model reset to prior')
    })
  }

  async exportJson(): Promise<PersistedModel | null> {
    if (!this.client) return null
    const m = await this.enqueue(() => this.client!.exportModel())
    const blob = new Blob([JSON.stringify(m)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `smart-web-model-${new Date(m.updatedAt || Date.now()).toISOString().slice(0, 19)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    return m
  }

  async exportLink(): Promise<string | null> {
    if (!this.client) return null
    const f = await this.enqueue(() => this.client!.exportFragment())
    const link = `${location.origin}${location.pathname}#m=${f}`
    this.set({ shareLink: link })
    try { await navigator.clipboard?.writeText(link) } catch { /* clipboard may be unavailable */ }
    return link
  }

  async importJsonText(text: string): Promise<void> {
    await this.enqueue(async () => {
      if (!this.client) return
      const model = JSON.parse(text) as PersistedModel
      const s = await this.client.importModel(model, selectModelFeatures(this.fx.idle()), this.state.category)
      this.set({ orders: s.orders ?? defaultOrders(), navOrder: s.navOrder ?? [...CATEGORIES] })
      this.apply(s, 'all')
      this.log(`imported model (${s.stats.examples} examples)`)
    })
  }

  async importFragment(fragment: string): Promise<void> {
    await this.enqueue(async () => {
      if (!this.client) return
      const s = await this.client.importFragment(fragment, selectModelFeatures(this.fx.idle()), this.state.category)
      this.set({ orders: s.orders ?? defaultOrders(), navOrder: s.navOrder ?? [...CATEGORIES] })
      this.apply(s, 'all')
      this.log('imported model from link')
    })
  }

  /** Measure the model's size: parameter count, raw float32 weights, saved JSON and share link. */
  async measureSize(): Promise<void> {
    if (!this.client) return
    const [m, f] = await this.enqueue(async () => [await this.client!.exportModel(), await this.client!.exportFragment()] as const)
    const { inputs: I, hidden: H, outputs: O } = SHAPE
    const params = I * H + H + H * O + O
    this.set({ modelSize: { params, float32Bytes: params * 4, jsonBytes: new Blob([JSON.stringify(m)]).size, linkBytes: f.length } })
  }

  /**
   * Time every engine mode on this browser: mount a temporary net offscreen, feed it the model's
   * current weights and jittered real contexts, time setInputs + readOutputs, check against JS.
   */
  async benchmark(evals = 40): Promise<void> {
    if (!this.mod || !this.snap || this.state.benchmarking) return
    this.set({ benchmarking: true })
    const results: NonNullable<AppState['benchmark']> = []
    const s = this.snap
    const time = (mount: (h: HTMLElement) => CssNet) => {
      const box = document.createElement('div')
      box.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden'
      document.body.appendChild(box)
      const net = mount(box)
      try {
        net.setWeights(s.weights)
        let total = 0, maxDiff = 0
        for (let k = 0; k < evals; k++) {
          const c = CATEGORIES[k % 3]
          const mask = categoryMask(c)
          const x = Float32Array.from(s.xByCategory[c], (v, i) => (i < 7 ? v + Math.sin(k * 7 + i) * 0.8 : v))
          const t0 = performance.now()
          net.setInputs(x, mask)
          const out = net.readOutputs()
          total += performance.now() - t0
          const js = this.mod!.jsForward(SHAPE, s.weights, x, mask).out
          for (let i = 0; i < out.length; i++) maxDiff = Math.max(maxDiff, Math.abs(out[i] - js[i]))
        }
        return { us: (total / evals) * 1000, maxDiff }
      } finally { net.destroy(); box.remove() }
    }
    for (const mode of ['calc', 'hybrid', 'animation'] as CssNetMode[]) {
      await new Promise((r) => setTimeout(r, 16)) // let a frame through between runs
      const bare = this.mod.mountBare ? time((h) => this.mod!.mountBare!(h, SHAPE, mode)) : time((h) => mountNet(this.mod!, h, SHAPE, mode).net)
      await new Promise((r) => setTimeout(r, 16))
      const withNodes = time((h) => mountNet(this.mod!, h, SHAPE, mode, { nodeOutputs: [0, 1, 2, 3, 4, 5] }).net)
      results.push({ mode, usPerEval: bare.us, usWithNodes: withNodes.us, maxDiff: Math.max(bare.maxDiff, withNodes.maxDiff), evals })
    }
    this.set({ benchmark: results, benchmarking: false })
  }

  /** Seeded journey with clear per-category preferences, synthetic pointer dynamics, virtual clock. */
  async replay(seed = 42, length = 48, stepDelayMs = 110): Promise<void> {
    if (this.state.replaying) return
    this.set({ replaying: true })
    const steps = generateJourney(seed, length)
    let vt = performance.now()
    let pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    try {
      for (let k = 0; k < steps.length; k++) {
        const step = steps[k]
        const id = stepTestId(step.target)
        const el = document.querySelector(`[data-testid="${id}"]`)
        const r = el?.getBoundingClientRect() ?? { left: pos.x - 40, top: pos.y - 20, width: 80, height: 40 }
        const rect = { left: r.left, top: r.top, width: r.width, height: r.height }
        const out = synthesizeStep(this.fx, step, pos, rect, id, vt, seed * 1000 + k)
        vt = out.t
        pos = out.pos
        const tgt = step.target
        if (tgt.kind === 'nav') await this.enter(tgt.category, { t: vt, t0: performance.now() })
        else await this.engage(tgt.card, tgt.verb, { t: vt, t0: performance.now() })
        await new Promise((res) => setTimeout(res, stepDelayMs))
      }
    } finally {
      const skew = vt - performance.now()
      if (skew > 0) this.fx.rebase(skew)
      this.set({ replaying: false })
      this.log(`replayed ${steps.length} steps (seed ${seed})`)
    }
  }

  private installHook(): void {
    const hook: SmartWebTestHook & SmartWebTestExtras = {
      cssOutputs: () => (this.net ? Array.from(this.net.readOutputs()) : []),
      jsOutputs: () => {
        if (!this.snap || !this.mod) return []
        const c = this.state.category
        return Array.from(this.mod.jsForward(SHAPE, this.snap.weights, Float32Array.from(this.snap.xByCategory[c]), categoryMask(c)).out)
      },
      features: () => [...this.state.x],
      category: () => this.state.category,
      order: (c) => [...this.state.orders[c ?? this.state.category]],
      stats: () => ({ examples: this.state.stats.examples, affinityAcc: this.state.stats.affinityAcc, mlpAcc: this.state.stats.mlpAcc, alpha: this.state.alpha, mode: this.state.mode }),
      latencies: () => [...this.lat],
      setMode: (m) => this.setMode(m),
      reset: () => this.reset(),
      netSource: () => this.state.netSource,
      hidden: () => (this.net ? Array.from(this.net.readHidden()) : []),
      weights: () => {
        const w = this.snap?.weights
        return w ? { W1: Array.from(w.W1), b1: Array.from(w.b1), W2: Array.from(w.W2), b2: Array.from(w.b2) } : null
      },
      scores: () => [...this.state.scores],
      cssAll: () => [...this.state.cssAll],
      benchmark: () => this.state.benchmark,
      jsAll: () => {
        const out = new Array(SHAPE.outputs).fill(0)
        if (!this.snap || !this.mod) return out
        for (const c of CATEGORIES) {
          const mask = categoryMask(c)
          const o = this.mod.jsForward(SHAPE, this.snap.weights, Float32Array.from(this.snap.xByCategory[c]), mask).out
          CARD_IDS.forEach((_, i) => { if (mask[i]) out[i] = o[i] })
        }
        return out
      },
      affinity: () => [...this.state.affinity],
      evidence: () => ({ ...this.state.evidence }),
      alpha: () => this.state.alpha,
      orders: () => JSON.parse(JSON.stringify(this.state.orders)) as Orders,
      navOrder: () => [...this.state.navOrder],
      latenciesDoubleRaf: () => [...this.latDbl],
      idle: () => this.enqueue(async () => undefined),
    }
    ;(window as unknown as { __smartweb: SmartWebTestHook & SmartWebTestExtras }).__smartweb = hook
  }
}
