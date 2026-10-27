import {
  CARD_IDS, CATEGORIES, categoryMask, type ActionId, type CardId, type Category, type CssNet, type CssNetMode, type SmartWebTestHook, type Verb,
} from '../cssnet/contract'
import { SHAPE } from '../model/config'
import { ModelClient } from '../model/client'
import { fragmentParam } from '../model/quantize'
import type { ModelSnapshot, ModelStats, Orders, PersistedModel } from '../model/types'
import { FeatureExtractor, attachDomListeners } from '../signals/extractor'
import { selectModelFeatures } from '../signals/features'
import { MIN_EVIDENCE, blendScores, defaultOrders, movedCards, reorder, swapMargin } from './adaptive'
import { NAV_ACTION } from './catalog'
import { isProbVector, loadCssNetModule, mountNet, type CssNetModule } from './cssnetBridge'
import { generateJourney, stepTestId, synthesizeStep } from './replay'

const LATENCY_KEEP = 100

/** Test-only extras on window.__smartweb, beyond the contract's SmartWebTestHook. */
export interface SmartWebTestExtras {
  netSource(): 'cssnet' | 'fallback' | 'none'
  /** Hidden activations read back from the CSS net. */
  hidden(): number[]
  /** Current MLP weights (row-major, as the contract's NetWeights). */
  weights(): { W1: number[]; b1: number[]; W2: number[]; b2: number[] } | null
  /** Blended score per card (18). */
  scores(): number[]
  affinity(): number[]
  evidence(): Record<Category, number>
  alpha(): number
  orders(): Orders
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
    engaged: {}, favorites: {}, latencies: [], latenciesDoubleRaf: [], replaying: false, messages: [], shareLink: null, version: 0,
  }
}

export class SmartWebController {
  state: AppState = initialState()
  private listeners = new Set<() => void>()
  private fx = new FeatureExtractor(performance.now(), { width: typeof window !== 'undefined' ? window.innerWidth : 1280 })
  private client: ModelClient | null = null
  private mod: CssNetModule | null = null
  private net: CssNet | null = null
  private host: HTMLElement | null = null
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
    this.detach = attachDomListeners(this.fx)
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
    const mounted = mountNet(this.mod, host, SHAPE, this.state.mode)
    if (mounted.error) this.log(mounted.error)
    this.net = mounted.net
    this.client = this.makeClient()
    const fragment = typeof location !== 'undefined' ? fragmentParam(location.hash) : null
    const raw = this.fx.idle()
    const r = await this.enqueue(() => this.client!.init(selectModelFeatures(raw), this.state.category, fragment))
    if (r.error) this.log(r.error)
    if (r.source === 'fragment') {
      this.log('model imported from URL fragment')
      history.replaceState(null, '', location.pathname + location.search)
    } else if (r.source === 'idb') this.log('model restored from IndexedDB')
    this.set({ ready: true, netSource: mounted.source, jsForwardSource: this.mod.jsForwardSource, workerKind: this.client.kind, raw: Array.from(raw) })
    // On load: restore the saved orders, then bring every category up to date.
    if (r.snapshot.orders) this.set({ orders: r.snapshot.orders })
    this.apply(r.snapshot, 'all')
  }

  stop(): void {
    this.detach?.()
    this.net?.destroy()
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
    if (changed) void this.client?.setOrders(orders)

    this.set({
      orders, moved: changed ? moved : this.state.moved, orderVersion: this.state.orderVersion + (changed ? 1 : 0), scores, affinity: Array.from(s.affinity), evidence: s.evidence, mlpWorker: Array.from(s.mlp),
      css: Array.from(css), js: Array.from(js), hidden: Array.from(hidden), cssJsMaxDiff: maxDiff, cssValid,
      alpha: s.alpha, x: Array.from(x), stats: s.stats,
    })
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
    const raw = this.fx.snapshot(NAV_ACTION[category], t)
    this.set({ category, moved: [] })
    return this.enqueue(async () => {
      if (!this.client) return
      const s = await this.client.predict(selectModelFeatures(raw), category)
      this.pendingLatencyT0 = t0
      this.apply(s, 'entry')
    })
  }

  /** The user engaged a card in the current category: train, then re-sort the category live. */
  engage(card: CardId, verb: Verb, opts: { t?: number; t0?: number } = {}): Promise<void> {
    const now = performance.now()
    const t = opts.t ?? now
    const t0 = this.latencyStart(now, opts.t0)
    const raw = this.fx.snapshot(verb as ActionId, t)
    const category = this.state.category
    const engaged = { ...this.state.engaged, [card]: (this.state.engaged[card] ?? 0) + 1 }
    const favorites = verb === 'favorite' ? { ...this.state.favorites, [card]: !this.state.favorites[card] } : this.state.favorites
    this.set({ engaged, favorites })
    return this.enqueue(async () => {
      if (!this.client) return
      const s = await this.client.step(selectModelFeatures(raw), card, verb, category, t)
      this.pendingLatencyT0 = t0
      this.set({ raw: Array.from(raw) })
      this.apply(s, 'live')
    })
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
        this.set({ latencies: [...this.state.latencies, ms].slice(-LATENCY_KEEP) })
        ch.port1.close()
      }
      ch.port2.postMessage(0)
      requestAnimationFrame(() => {
        const ms = performance.now() - t0
        this.set({ latenciesDoubleRaf: [...this.state.latenciesDoubleRaf, ms].slice(-LATENCY_KEEP) })
      })
    })
  }

  setMode(mode: CssNetMode): void {
    if (mode === this.state.mode && this.net) return
    this.set({ mode })
    if (!this.host || !this.mod) return
    this.net?.destroy()
    const m = mountNet(this.mod, this.host, SHAPE, mode)
    if (m.error) this.log(m.error)
    this.net = m.net
    this.set({ netSource: m.source })
    if (this.snap) this.apply(this.snap, 'none')
  }

  reset(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.client) return
      const s = await this.client.reset(selectModelFeatures(this.fx.idle()), this.state.category)
      this.set({ orders: defaultOrders(), moved: [], latencies: [], latenciesDoubleRaf: [], engaged: {}, favorites: {} })
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
      this.set({ orders: s.orders ?? defaultOrders() })
      this.apply(s, 'all')
      this.log(`imported model (${s.stats.examples} examples)`)
    })
  }

  async importFragment(fragment: string): Promise<void> {
    await this.enqueue(async () => {
      if (!this.client) return
      const s = await this.client.importFragment(fragment, selectModelFeatures(this.fx.idle()), this.state.category)
      this.set({ orders: s.orders ?? defaultOrders() })
      this.apply(s, 'all')
      this.log('imported model from link')
    })
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
      latencies: () => [...this.state.latencies],
      setMode: (m) => this.setMode(m),
      reset: () => this.reset(),
      netSource: () => this.state.netSource,
      hidden: () => (this.net ? Array.from(this.net.readHidden()) : []),
      weights: () => {
        const w = this.snap?.weights
        return w ? { W1: Array.from(w.W1), b1: Array.from(w.b1), W2: Array.from(w.W2), b2: Array.from(w.b2) } : null
      },
      scores: () => [...this.state.scores],
      affinity: () => [...this.state.affinity],
      evidence: () => ({ ...this.state.evidence }),
      alpha: () => this.state.alpha,
      orders: () => JSON.parse(JSON.stringify(this.state.orders)) as Orders,
      latenciesDoubleRaf: () => [...this.state.latenciesDoubleRaf],
      idle: () => this.enqueue(async () => undefined),
    }
    ;(window as unknown as { __smartweb: SmartWebTestHook & SmartWebTestExtras }).__smartweb = hook
  }
}
