import { ACTIONS, type ActionId } from '../cssnet/contract'
import { RAW_FEATURE_COUNT, RAW_FEATURE_NAMES } from './features'

/** Plain event shapes so the extractor is testable and replayable without the DOM. */
export interface PointerSample { t: number; x: number; y: number }
export interface PointerDownSample extends PointerSample {
  pointerType?: string
  pressure?: number
  /** Bounding rect of the target control, if known. */
  rect?: { left: number; top: number; width: number; height: number }
  targetKey?: string | null
}
export interface KeySample { t: number; key: string; ctrl?: boolean; meta?: boolean; alt?: boolean }
export interface ScrollSample { t: number; y: number; max: number }

interface Press {
  down: PointerDownSample
  upT: number | null
  approachVelocity: number
  deceleration: number
  pathStraightness: number
  tremor: number
  hoverDwell: number
  offsetFromCenter: number
  targetSize: number
  timeSinceLastClick: number
  burstCount2s: number
}

const VIEW_ACTIONS: ActionId[] = ['nav-home', 'nav-explore', 'nav-library']

function speed(samples: PointerSample[]): number {
  if (samples.length < 2) return 0
  let d = 0
  for (let i = 1; i < samples.length; i++) {
    d += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y)
  }
  const dt = samples[samples.length - 1].t - samples[0].t
  return dt > 0 ? d / dt : 0
}

export class FeatureExtractor {
  private moves: PointerSample[] = []
  private downs: number[] = []
  private press: Press | null = null
  private hoverKey: string | null = null
  private hoverSince = 0
  private lastDownT: number | null = null

  private scrollY = 0
  private scrollLastT: number | null = null
  private scrollVel = 0
  private scrollDir = 0
  private scrollReversalTs: number[] = []
  private scrollDepth = 0

  private keyTs: number[] = []
  private keyHist: boolean[] = [] // true = backspace
  private shortcuts = 0

  private blurs = 0
  private actionCount = 0
  private journey: ActionId[] = []
  private view: ActionId = 'nav-home'
  private viewSince: number
  private visits = new Map<ActionId, number>([['nav-home', 1]])

  /** Last raw vector produced by snapshot(). */
  last: Float32Array = new Float32Array(RAW_FEATURE_COUNT)

  private sessionStart: number
  private viewport: { width: number }
  private readonly now: () => Date

  constructor(sessionStart: number, viewport: { width: number } = { width: 1280 }, now: () => Date = () => new Date()) {
    this.sessionStart = sessionStart
    this.viewport = viewport
    this.now = now
    this.viewSince = sessionStart
  }

  // ---------------- pointer ----------------
  pointerMove(s: PointerSample): void {
    this.moves.push(s)
    const cutoff = s.t - 1000
    while (this.moves.length && this.moves[0].t < cutoff) this.moves.shift()
  }

  pointerOver(t: number, targetKey: string | null): void {
    if (targetKey !== this.hoverKey) {
      this.hoverKey = targetKey
      this.hoverSince = t
    }
  }

  pointerDown(s: PointerDownSample): void {
    const t = s.t
    this.pointerMove(s)
    const win = (a: number, b: number) => this.moves.filter((m) => m.t >= t - a && m.t <= t - b)
    const approach = win(300, 0)
    const early = win(300, 150)
    const late = win(150, 0)
    const path = win(500, 0)
    let pathLen = 0
    for (let i = 1; i < path.length; i++) pathLen += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    const chord = path.length > 1 ? Math.hypot(path[path.length - 1].x - path[0].x, path[path.length - 1].y - path[0].y) : 0
    let tremor = 0
    if (late.length > 1) {
      const cx = late.reduce((a, m) => a + m.x, 0) / late.length
      const cy = late.reduce((a, m) => a + m.y, 0) / late.length
      tremor = Math.sqrt(late.reduce((a, m) => a + (m.x - cx) ** 2 + (m.y - cy) ** 2, 0) / late.length)
    }
    let offset = 0
    let size = 0
    if (s.rect && s.rect.width > 0 && s.rect.height > 0) {
      const cx = s.rect.left + s.rect.width / 2
      const cy = s.rect.top + s.rect.height / 2
      offset = Math.hypot(s.x - cx, s.y - cy) / (Math.hypot(s.rect.width, s.rect.height) / 2)
      size = Math.sqrt(s.rect.width * s.rect.height)
    }
    this.downs.push(t)
    while (this.downs.length && this.downs[0] < t - 2000) this.downs.shift()
    const sinceLast = this.lastDownT === null ? 60000 : Math.min(60000, Math.max(0, t - this.lastDownT))
    this.lastDownT = t
    const hoverMatches = s.targetKey !== undefined && s.targetKey !== null && s.targetKey === this.hoverKey
    this.press = {
      down: s,
      upT: null,
      approachVelocity: speed(approach),
      deceleration: speed(early) - speed(late),
      pathStraightness: pathLen > 0 ? Math.min(1, chord / pathLen) : 1,
      tremor,
      hoverDwell: hoverMatches ? Math.max(0, t - this.hoverSince) : 0,
      offsetFromCenter: offset,
      targetSize: size,
      timeSinceLastClick: sinceLast,
      burstCount2s: this.downs.length,
    }
  }

  pointerUp(t: number): void {
    if (this.press && this.press.upT === null) this.press.upT = t
  }

  /** pointerup timestamp of the fresh press (the event that fires a press action), or null if still down / stale. */
  lastReleaseTime(now: number, maxAge = 2000): number | null {
    if (!this.press || this.press.upT === null) return null
    return now - this.press.upT <= maxAge ? this.press.upT : null
  }

  /** pointerdown timestamp of the press that is still "fresh" (for latency). */
  lastPressTime(now: number, maxAge = 2000): number | null {
    if (!this.press) return null
    return now - this.press.down.t <= maxAge ? this.press.down.t : null
  }

  // ---------------- scroll ----------------
  scroll(s: ScrollSample): void {
    if (this.scrollLastT !== null) {
      const dt = Math.max(1, s.t - this.scrollLastT)
      const dy = s.y - this.scrollY
      const v = Math.abs(dy) / dt
      this.scrollVel = 0.7 * this.scrollVel + 0.3 * v
      const dir = Math.sign(dy)
      if (dir !== 0 && this.scrollDir !== 0 && dir !== this.scrollDir) this.scrollReversalTs.push(s.t)
      if (dir !== 0) this.scrollDir = dir
    }
    this.scrollY = s.y
    this.scrollLastT = s.t
    this.scrollDepth = s.max > 0 ? Math.min(1, Math.max(0, s.y / s.max)) : 0
  }

  // ---------------- keyboard ----------------
  key(k: KeySample): void {
    this.keyTs.push(k.t)
    if (this.keyTs.length > 50) this.keyTs.shift()
    this.keyHist.push(k.key === 'Backspace')
    if (this.keyHist.length > 50) this.keyHist.shift()
    if (k.ctrl || k.meta || k.alt) this.shortcuts++
  }

  /**
   * Shift every stored timestamp by -delta. Used after a replay that ran on a
   * virtual clock ahead of real time, so later real events stay consistent.
   */
  rebase(delta: number): void {
    if (!delta) return
    this.moves = this.moves.map((m) => ({ ...m, t: m.t - delta }))
    this.downs = this.downs.map((d) => d - delta)
    if (this.press) this.press = { ...this.press, down: { ...this.press.down, t: this.press.down.t - delta }, upT: this.press.upT === null ? null : this.press.upT - delta }
    this.hoverSince -= delta
    if (this.lastDownT !== null) this.lastDownT -= delta
    if (this.scrollLastT !== null) this.scrollLastT -= delta
    this.scrollReversalTs = this.scrollReversalTs.map((r) => r - delta)
    this.keyTs = this.keyTs.map((k) => k - delta)
    this.viewSince -= delta
    this.sessionStart -= delta
  }

  // ---------------- session ----------------
  blur(): void { this.blurs++ }
  setViewport(width: number): void { this.viewport = { width } }

  get history(): readonly ActionId[] { return this.journey }

  /**
   * Called when an action fires. Computes the raw vector describing the
   * interaction that produced `action`, then pushes `action` onto the journey
   * so the returned vector's last1 one-hot is this action.
   */
  snapshot(action: ActionId, t: number): Float32Array {
    const v = new Float32Array(RAW_FEATURE_COUNT)
    let i = 0
    const p = this.press && t - this.press.down.t <= 2000 ? this.press : null
    // pointer (12)
    v[i++] = p && p.upT !== null ? Math.max(0, p.upT - p.down.t) : 0
    v[i++] = p?.approachVelocity ?? 0
    v[i++] = p?.deceleration ?? 0
    v[i++] = p?.pathStraightness ?? 1
    v[i++] = p?.tremor ?? 0
    v[i++] = p?.hoverDwell ?? 0
    v[i++] = p?.offsetFromCenter ?? 0
    v[i++] = p?.targetSize ?? 0
    v[i++] = p?.timeSinceLastClick ?? (this.lastDownT === null ? 60000 : Math.min(60000, Math.max(0, t - this.lastDownT)))
    v[i++] = this.downs.filter((d) => d >= t - 2000).length
    const pt = p?.down.pointerType
    v[i++] = pt === 'touch' ? 1 : pt === 'pen' ? 0.5 : 0
    v[i++] = p?.down.pressure ?? 0
    // scroll (4)
    v[i++] = this.scrollVel
    v[i++] = this.scrollReversalTs.filter((r) => r >= t - 5000).length
    v[i++] = this.scrollDepth
    v[i++] = this.scrollLastT === null ? 60000 : Math.min(60000, Math.max(0, t - this.scrollLastT))
    // keyboard (4)
    v[i++] = this.keyTs.filter((k) => k >= t - 5000).length / 5
    v[i++] = this.keyHist.length ? this.keyHist.filter(Boolean).length / this.keyHist.length : 0
    const iv = this.keyTs.slice(-21).map((k, j, a) => (j ? k - a[j - 1] : NaN)).slice(1)
    if (iv.length > 1) {
      const m = iv.reduce((a, b) => a + b, 0) / iv.length
      v[i++] = Math.sqrt(iv.reduce((a, b) => a + (b - m) ** 2, 0) / iv.length)
    } else v[i++] = 0
    v[i++] = this.shortcuts
    // session (8)
    this.actionCount++
    if (VIEW_ACTIONS.includes(action)) {
      if (action !== this.view) {
        this.view = action
        this.viewSince = t
        this.visits.set(action, (this.visits.get(action) ?? 0) + 1)
      }
    }
    const sessionS = Math.max(0, t - this.sessionStart) / 1000
    v[i++] = sessionS
    v[i++] = this.actionCount
    v[i++] = Math.max(0, t - this.viewSince) / 1000
    v[i++] = this.visits.get(this.view) ?? 1
    v[i++] = sessionS > 0 ? this.blurs / Math.max(sessionS / 60, 1 / 60) : 0
    const d = this.now()
    const frac = (d.getHours() * 60 + d.getMinutes()) / 1440
    v[i++] = Math.sin(2 * Math.PI * frac)
    v[i++] = Math.cos(2 * Math.PI * frac)
    const w = this.viewport.width
    v[i++] = w < 640 ? 0 : w < 1024 ? 0.5 : 1
    // journey (24)
    this.journey = [action, ...this.journey].slice(0, 3)
    for (let k = 0; k < 3; k++) {
      const a = this.journey[k]
      if (a) v[i + k * ACTIONS.length + ACTIONS.indexOf(a)] = 1
    }
    i += 3 * ACTIONS.length
    if (i !== RAW_FEATURE_COUNT) throw new Error(`feature count drift ${i}`)
    this.last = v
    return v
  }

  /** Initial vector before any action (no journey, no press). */
  idle(): Float32Array {
    const v = new Float32Array(RAW_FEATURE_COUNT)
    v[RAW_FEATURE_NAMES.indexOf('pathStraightness')] = 1
    v[RAW_FEATURE_NAMES.indexOf('timeSinceLastClick')] = 60000
    v[RAW_FEATURE_NAMES.indexOf('scrollIdleGap')] = 60000
    this.last = v
    return v
  }
}

/** Find the learnable control key (data-testid) for an event target. */
export function targetKeyOf(el: EventTarget | null): string | null {
  const node = el instanceof Element ? el.closest('[data-testid^="action-"],[data-testid="suggestion-item"]') : null
  return node ? node.getAttribute('data-testid') + (node.getAttribute('data-action') ?? '') : null
}

/** Wire the extractor to real DOM events. Returns a detach function. */
export function attachDomListeners(fx: FeatureExtractor, win: Window = window): () => void {
  const opts = { capture: true, passive: true } as const
  const onMove = (e: PointerEvent) => fx.pointerMove({ t: e.timeStamp, x: e.clientX, y: e.clientY })
  const onOver = (e: PointerEvent) => fx.pointerOver(e.timeStamp, targetKeyOf(e.target))
  const onDown = (e: PointerEvent) => {
    const key = targetKeyOf(e.target)
    const node = e.target instanceof Element ? e.target.closest('[data-testid]') : null
    const r = node?.getBoundingClientRect()
    fx.pointerDown({
      t: e.timeStamp, x: e.clientX, y: e.clientY, pointerType: e.pointerType, pressure: e.pressure,
      rect: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : undefined,
      targetKey: key,
    })
  }
  const onUp = (e: PointerEvent) => fx.pointerUp(e.timeStamp)
  const onScroll = (e: Event) => {
    const d = win.document.documentElement
    fx.scroll({ t: e.timeStamp, y: win.scrollY, max: d.scrollHeight - win.innerHeight })
  }
  const onKey = (e: KeyboardEvent) => fx.key({ t: e.timeStamp, key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey })
  const onBlur = () => fx.blur()
  const onResize = () => fx.setViewport(win.innerWidth)
  win.addEventListener('pointermove', onMove, opts)
  win.addEventListener('pointerover', onOver, opts)
  win.addEventListener('pointerdown', onDown, opts)
  win.addEventListener('pointerup', onUp, opts)
  win.addEventListener('scroll', onScroll, opts)
  win.addEventListener('keydown', onKey, opts)
  win.addEventListener('blur', onBlur)
  win.addEventListener('resize', onResize)
  onResize()
  return () => {
    win.removeEventListener('pointermove', onMove, opts)
    win.removeEventListener('pointerover', onOver, opts)
    win.removeEventListener('pointerdown', onDown, opts)
    win.removeEventListener('pointerup', onUp, opts)
    win.removeEventListener('scroll', onScroll, opts)
    win.removeEventListener('keydown', onKey, opts)
    win.removeEventListener('blur', onBlur)
    win.removeEventListener('resize', onResize)
  }
}
