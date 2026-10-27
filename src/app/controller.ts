import { type ActionId, type CssNet, type CssNetMode, type SmartWebTestHook } from '../cssnet/contract'
import { PRIOR, SHAPE } from '../model/config'
import { ModelClient } from '../model/client'
import { fragmentParam } from '../model/quantize'
import type { ModelSnapshot, PersistedModel } from '../model/types'
import { FeatureExtractor, attachDomListeners } from '../signals/extractor'
import { selectModelFeatures } from '../signals/features'
import { GRID_ACTIONS, blend, nextGridOrder, rank } from './adaptive'
import { isProbVector, loadCssNetModule, mountNet, type CssNetModule } from './cssnetBridge'
import { generateJourney, synthesizeStep } from './replay'

export type View = 'nav-home' | 'nav-explore' | 'nav-library'
const LATENCY_KEEP = 100

export interface AppState {
  ready: boolean
  mode: CssNetMode
  netSource: 'cssnet' | 'fallback' | 'none'
  jsForwardSource: string
  workerKind: 'worker' | 'local'
  ranking: ActionId[]
  blended: number[]
  markov: number[]
  mlpWorker: number[]
  css: number[]
  js: number[]
  hidden: number[]
  cssJsMaxDiff: number
  cssValid: boolean
  alpha: number
  x: number[]
  raw: number[]
  stats: { examples: number; markovAcc: number; mlpAcc: number; accN: number }
  gridOrder: ActionId[]
  lastMoved: ActionId | null
  lastAction: ActionId | null
  view: View
  favorites: number
  shares: number
  opened: number
  compact: boolean
  query: string
  latencies: number[]
  replaying: boolean
  messages: string[]
  shareLink: string | null
  version: number
}

const zeros = (n: number) => new Array(n).fill(0)

function initialState(): AppState {
  return {
    ready: false, mode: 'calc', netSource: 'none', jsForwardSource: 'local', workerKind: 'local',
    ranking: rank(PRIOR), blended: [...PRIOR], markov: [...PRIOR], mlpWorker: [...PRIOR], css: [...PRIOR], js: [...PRIOR],
    hidden: zeros(SHAPE.hidden), cssJsMaxDiff: 0, cssValid: true, alpha: 0,
    x: zeros(SHAPE.inputs), raw: [], stats: { examples: 0, markovAcc: 0, mlpAcc: 0, accN: 0 },
    gridOrder: [...GRID_ACTIONS], lastMoved: null, lastAction: null, view: 'nav-home',
    favorites: 0, shares: 0, opened: 0, compact: false, query: '', latencies: [], replaying: false,
    messages: [], shareLink: null, version: 0,
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
    this.mod = await loadCssNetModule()
    this.mod.errors.forEach((e) => this.log(e))
    const mounted = mountNet(this.mod, host, SHAPE, this.state.mode)
    if (mounted.error) this.log(mounted.error)
    this.net = mounted.net
    this.client = this.makeClient()
    const fragment = typeof location !== 'undefined' ? fragmentParam(location.hash) : null
    const raw = this.fx.idle()
    const r = await this.enqueue(() => this.client!.init(selectModelFeatures(raw), fragment))
    if (r.error) this.log(r.error)
    if (r.source === 'fragment') {
      this.log('model imported from URL fragment')
      history.replaceState(null, '', location.pathname + location.search)
    } else if (r.source === 'idb') this.log('model restored from IndexedDB')
    this.set({ ready: true, netSource: mounted.source, jsForwardSource: this.mod.jsForwardSource, workerKind: this.client.kind, raw: Array.from(raw) })
    this.apply(r.snapshot, false)
  }

  stop(): void {
    this.detach?.()
    this.net?.destroy()
    this.client?.terminate()
    this.started = false
  }

  /** Push a model snapshot through the CSS net and recompute ranking + grid. */
  private apply(s: ModelSnapshot, adapt: boolean): void {
    this.snap = s
    let css: Float32Array = s.mlp
    let hidden: Float32Array = new Float32Array(SHAPE.hidden)
    let cssValid = false
    if (this.net) {
      try {
        this.net.setWeights(s.weights)
        this.net.setInputs(s.x)
        css = this.net.readOutputs()
        hidden = this.net.readHidden()
        cssValid = isProbVector(css, SHAPE.outputs)
      } catch (e) {
        this.log(`css net error: ${(e as Error).message}`)
      }
    }
    const js = this.mod ? this.mod.jsForward(SHAPE, s.weights, s.x).out : s.mlp
    const mlpForRanking = cssValid ? css : s.mlp
    const blended = blend(s.markov, mlpForRanking, s.alpha)
    let maxDiff = 0
    for (let i = 0; i < SHAPE.outputs; i++) maxDiff = Math.max(maxDiff, Math.abs((css[i] ?? NaN) - js[i]))
    const grid = adapt ? nextGridOrder(this.state.gridOrder, blended, PRIOR) : { order: this.state.gridOrder, moved: null }
    this.set({
      ranking: rank(blended), blended: Array.from(blended), markov: Array.from(s.markov), mlpWorker: Array.from(s.mlp),
      css: Array.from(css), js: Array.from(js), hidden: Array.from(hidden), cssJsMaxDiff: maxDiff, cssValid,
      alpha: s.alpha, x: Array.from(s.x), stats: s.stats, gridOrder: grid.order, lastMoved: grid.moved,
    })
  }

  /** A learnable action happened (user, suggestion click, or replay). */
  act(action: ActionId, opts: { t?: number; t0?: number } = {}): Promise<void> {
    const now = performance.now()
    const t = opts.t ?? now
    const t0 = opts.t0 ?? this.fx.lastPressTime(now) ?? now
    const raw = this.fx.snapshot(action, t)
    this.applyActionEffect(action)
    return this.enqueue(async () => {
      if (!this.client) return
      const s = await this.client.step(selectModelFeatures(raw), action)
      this.pendingLatencyT0 = t0
      this.set({ raw: Array.from(raw), lastAction: action })
      this.apply(s, true)
    })
  }

  private applyActionEffect(action: ActionId): void {
    const st = this.state
    switch (action) {
      case 'nav-home': case 'nav-explore': case 'nav-library': this.set({ view: action }); break
      case 'open-card': this.set({ opened: st.opened + 1 }); break
      case 'favorite': this.set({ favorites: st.favorites + 1 }); break
      case 'share': this.set({ shares: st.shares + 1 }); break
      case 'settings': this.set({ compact: !st.compact }); break
      case 'search': break
    }
  }

  setQuery(q: string): void { this.set({ query: q }) }

  /** Called by the UI after React committed a state version: measures click-to-pixel via double rAF. */
  committed(): void {
    const t0 = this.pendingLatencyT0
    if (t0 === null) return
    this.pendingLatencyT0 = null
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ms = performance.now() - t0
      this.set({ latencies: [...this.state.latencies, ms].slice(-LATENCY_KEEP) })
    }))
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
    if (this.snap) this.apply(this.snap, false)
  }

  reset(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.client) return
      const s = await this.client.reset(selectModelFeatures(this.fx.idle()))
      this.set({ gridOrder: [...GRID_ACTIONS], lastMoved: null, latencies: [], lastAction: null })
      this.apply(s, false)
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
      const s = await this.client.importModel(model, selectModelFeatures(this.fx.idle()))
      this.apply(s, false)
      this.log(`imported model (${s.stats.examples} examples)`)
    })
  }

  async importFragment(fragment: string): Promise<void> {
    await this.enqueue(async () => {
      if (!this.client) return
      const s = await this.client.importFragment(fragment, selectModelFeatures(this.fx.idle()))
      this.apply(s, false)
      this.log('imported model from link')
    })
  }

  /** Seeded scripted journey with synthetic pointer dynamics on a virtual clock. */
  async replay(seed = 42, length = 40, stepDelayMs = 120): Promise<void> {
    if (this.state.replaying) return
    this.set({ replaying: true })
    const steps = generateJourney(seed, length)
    let vt = performance.now()
    let pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    try {
      for (let k = 0; k < steps.length; k++) {
        const step = steps[k]
        const el = document.querySelector(`[data-testid="action-${step.action}"]`)
        const r = el?.getBoundingClientRect() ?? { left: pos.x - 40, top: pos.y - 20, width: 80, height: 40 }
        const rect = { left: r.left, top: r.top, width: r.width, height: r.height }
        const out = synthesizeStep(this.fx, step, pos, rect, `action-${step.action}`, vt, seed * 1000 + k)
        vt = out.t
        pos = out.pos
        await this.act(step.action, { t: vt, t0: performance.now() })
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
    const hook: SmartWebTestHook = {
      cssOutputs: () => (this.net ? Array.from(this.net.readOutputs()) : []),
      jsOutputs: () => (this.snap && this.mod ? Array.from(this.mod.jsForward(SHAPE, this.snap.weights, this.snap.x).out) : []),
      features: () => [...this.state.x],
      ranking: () => [...this.state.ranking],
      stats: () => ({ examples: this.state.stats.examples, markovAcc: this.state.stats.markovAcc, mlpAcc: this.state.stats.mlpAcc, mode: this.state.mode }),
      latencies: () => [...this.state.latencies],
      setMode: (m) => this.setMode(m),
      reset: () => this.reset(),
    }
    ;(window as unknown as { __smartweb: SmartWebTestHook }).__smartweb = hook
  }
}

export const ACTION_LABELS: Record<ActionId, string> = {
  'nav-home': 'Home', 'nav-explore': 'Explore', 'nav-library': 'Library', search: 'Search',
  'open-card': 'Open', favorite: 'Favorite', share: 'Share', settings: 'Compact mode',
}
