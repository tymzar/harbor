import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from 'react'

/**
 * Live picture of the 15-16-8 network.
 *
 * Every edge is a real weight: its opacity and width come from |w|. On each forward pass,
 * signals travel input -> hidden -> output along the edges that actually carried the most
 * signal (|x_i * W1[j,i]|, then |relu(h_j) * W2[k,j]|), and nodes settle to their new
 * activation as the signal arrives. All values shown are the ones the CSS engine computed.
 *
 * Cost: edges are painted once into an offscreen cache (only when weights, size or theme
 * change); each frame is one drawImage plus a few dozen signals and 39 nodes.
 */

export interface NetworkViewProps {
  x: number[]
  hidden: number[]
  out: number[]
  weights: { W1: ArrayLike<number>; W2: ArrayLike<number> } | null
  version: number
  /** Output ids and display names, indexed like the network outputs (18). */
  outIds: readonly string[]
  outLabels: readonly string[]
  /** Output indices to show, top to bottom (the current category, sorted by the network's own CSS output). */
  visible: number[]
  inputLabels?: string[]
  inputs: number
  hiddenN: number
  outputs?: number
  height?: number
  /** Where the CSS network mounts. Its nodes are drawn by the stylesheet itself. */
  hostRef?: Ref<HTMLDivElement>
  /** True when the CSS engine (not the JS fallback) is live, so nodes come from CSS. */
  cssNodes?: boolean
}

interface Signal { layer: 1 | 2; from: number; to: number; start: number; dur: number; s: number }
interface Flash { layer: 2 | 3; node: number; start: number }
type RGB = [number, number, number]

const L1_SIGNALS = 56
const L2_SIGNALS = 30
const HOP_MS = 700
const LABEL_W = 164
const IN_LABEL_W = 96

function toRGB(css: string, fallback: RGB): RGB {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 1
    const g = c.getContext('2d')!
    g.fillStyle = '#000'; g.fillStyle = css.trim() || '#000'
    g.fillRect(0, 0, 1, 1)
    const d = g.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2]]
  } catch { return fallback }
}
const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

function geometry(w: number, h: number, n: [number, number, number]) {
  const padY = 22
  const narrow = w < 560
  const x0 = narrow ? 16 : IN_LABEL_W + 18
  const x2 = Math.max(Math.round(w * 0.62), w - (narrow ? 96 : LABEL_W) - 18)
  const xs = [x0, Math.round((x0 + x2) / 2), x2]
  const ys = n.map((count) => Array.from({ length: count }, (_, k) => padY + ((h - 2 * padY) * (k + 0.5)) / count))
  return { xs, ys }
}

function bez(x0: number, y0: number, x1: number, y1: number, t: number): [number, number] {
  const dx = (x1 - x0) * 0.5
  const u = 1 - t
  const px = u * u * u * x0 + 3 * u * u * t * (x0 + dx) + 3 * u * t * t * (x1 - dx) + t * t * t * x1
  const py = u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1
  return [px, py]
}

/** Node positions and output names for the CSS-driven nodes, as inherited custom properties. */
function hostVars(geo: ReturnType<typeof geometry>, labels: readonly string[], visible: number[], I: number, H: number): CSSProperties {
  const v: Record<string, string> = { '--nv-in-x': `${geo.xs[0]}px`, '--nv-h-x': `${geo.xs[1]}px`, '--nv-o-x': `${geo.xs[2]}px` }
  for (let i = 0; i < I; i++) v[`--nv-in-y${i}`] = `${geo.ys[0][i]}px`
  for (let j = 0; j < H; j++) v[`--nv-h-y${j}`] = `${geo.ys[1][j]}px`
  // Masked outputs (other categories) are invisible; park them on the first slot.
  labels.forEach((l, k) => { v[`--nv-o-y${k}`] = `${geo.ys[2][Math.max(0, visible.indexOf(k))]}px`; v[`--nv-label${k}`] = JSON.stringify(l) })
  return v as CSSProperties
}

export function NetworkView(props: NetworkViewProps) {
  const { inputs: I, hiddenN: H, height = 340 } = props
  const vis = props.visible
  const O = vis.length
  const outV = vis.map((k) => props.out[k] ?? 0)
  const weightsV = props.weights ? { W1: props.weights.W1, W2: Float32Array.from(vis.flatMap((k) => Array.from(props.weights!.W2).slice(k * H, k * H + H))) } : null
  const visKey = vis.join(',')
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  // Latest props for the render loop, without re-subscribing it.
  const live = useRef({ ...props, out: outV, weights: weightsV, visKey })
  live.current = { ...props, out: outV, weights: weightsV, visKey }

  // Displayed (animated) values and pending targets.
  const disp = useRef({ x: new Float32Array(I), h: new Float32Array(H), o: new Float32Array(O).fill(1 / O) })
  const target = useRef({ x: new Float32Array(I), h: new Float32Array(H), o: new Float32Array(O).fill(1 / O), hAt: 0, oAt: 0 })
  const signals = useRef<Signal[]>([])
  const flashes = useRef<Flash[]>([])
  const cache = useRef<{ canvas: HTMLCanvasElement | null; key: string }>({ canvas: null, key: '' })
  const strong = useRef<{ layer: 1 | 2; from: number; to: number; s: number }[]>([])
  const reduced = useRef(false)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    setWidth(Math.round(el.getBoundingClientRect().width))
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduced.current = mq.matches
    const onMq = () => { reduced.current = mq.matches }
    mq.addEventListener('change', onMq)
    return () => { ro.disconnect(); mo.disconnect(); mq.removeEventListener('change', onMq) }
  }, [])

  // New forward pass (inputs or outputs changed): schedule the wave.
  const passKey = `${props.x.map((v) => v.toFixed(4)).join(',')}|${outV.map((v) => v.toFixed(5)).join(',')}|${visKey}`
  useEffect(() => {
    const p = live.current
    const now = performance.now()
    const t = target.current
    t.x.set(p.x.slice(0, I))
    const instant = reduced.current || !p.weights
    t.h.set(p.hidden.slice(0, H)); t.hAt = instant ? now : now + HOP_MS * 0.85
    t.o.set(p.out.slice(0, O)); t.oAt = instant ? now : now + HOP_MS * 1.85
    if (instant) { disp.current.x.set(t.x); return }
    const W1 = p.weights!.W1, W2 = p.weights!.W2
    const c1: { i: number; j: number; s: number }[] = []
    for (let j = 0; j < H; j++) for (let i = 0; i < I; i++) c1.push({ i, j, s: Math.abs((p.x[i] ?? 0) * W1[j * I + i]) })
    c1.sort((a, b) => b.s - a.s)
    const m1 = c1[0]?.s || 1
    const sig: Signal[] = []
    for (const e of c1.slice(0, L1_SIGNALS)) if (e.s > 1e-4) sig.push({ layer: 1, from: e.i, to: e.j, start: now + Math.random() * 90, dur: HOP_MS * (0.85 + Math.random() * 0.3), s: 0.35 + 0.65 * (e.s / m1) })
    const c2: { j: number; k: number; s: number }[] = []
    for (let k = 0; k < O; k++) for (let j = 0; j < H; j++) c2.push({ j, k, s: Math.max(0, p.hidden[j] ?? 0) * Math.abs(W2[k * H + j]) * (0.4 + (p.out[k] ?? 0)) })
    c2.sort((a, b) => b.s - a.s)
    const m2 = c2[0]?.s || 1
    for (const e of c2.slice(0, L2_SIGNALS)) if (e.s > 1e-4) sig.push({ layer: 2, from: e.j, to: e.k, start: now + HOP_MS * 0.9 + Math.random() * 90, dur: HOP_MS * (0.85 + Math.random() * 0.3), s: 0.35 + 0.65 * (e.s / m2) })
    signals.current = signals.current.filter((s) => s.s < 0.3).concat(sig)
    strong.current = [
      ...c1.slice(0, 24).map((e) => ({ layer: 1 as const, from: e.i, to: e.j, s: e.s / m1 })),
      ...c2.slice(0, 12).map((e) => ({ layer: 2 as const, from: e.j, to: e.k, s: e.s / m2 })),
    ]
  }, [passKey, I, H, O])

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !width) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')!
    const cs = getComputedStyle(document.documentElement)
    const fg = toRGB(cs.getPropertyValue('--foreground'), dark ? [240, 240, 240] : [20, 20, 22])
    const accent = toRGB(cs.getPropertyValue('--accent'), [0, 111, 238])
    const geo = geometry(width, height, [I, H, O])
    const glowOp: GlobalCompositeOperation = dark ? 'lighter' : 'source-over'

    // Glow sprite.
    const sprite = document.createElement('canvas')
    const SP = 48; sprite.width = sprite.height = SP * dpr
    {
      const g = sprite.getContext('2d')!
      const gr = g.createRadialGradient(SP * dpr / 2, SP * dpr / 2, 0, SP * dpr / 2, SP * dpr / 2, SP * dpr / 2)
      gr.addColorStop(0, rgba(accent, 0.9)); gr.addColorStop(0.25, rgba(accent, 0.35)); gr.addColorStop(1, rgba(accent, 0))
      g.fillStyle = gr; g.fillRect(0, 0, SP * dpr, SP * dpr)
    }

    const drawEdges = (w: NetworkViewProps['weights']) => {
      const key = w ? `${width}|${height}|${dark}|${live.current.visKey}|${Array.from(w.W1).reduce((a, b) => a + Math.abs(b), 0).toFixed(4)}|${Array.from(w.W2).reduce((a, b) => a + Math.abs(b), 0).toFixed(4)}` : `${width}|${height}|${dark}|none`
      if (cache.current.key === key && cache.current.canvas) return cache.current.canvas
      const off = cache.current.canvas ?? document.createElement('canvas')
      off.width = canvas.width; off.height = canvas.height
      const g = off.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, width, height)
      const layer = (A: ArrayLike<number> | null, nFrom: number, nTo: number, x0: number, x1: number, ys0: number[], ys1: number[]) => {
        let m = 1e-6
        if (A) for (let q = 0; q < A.length; q++) m = Math.max(m, Math.abs(A[q]))
        for (let to = 0; to < nTo; to++) for (let fr = 0; fr < nFrom; fr++) {
          const a = A ? Math.abs(A[to * nFrom + fr]) / m : 0.15
          g.strokeStyle = rgba(fg, (dark ? 0.03 : 0.035) + (dark ? 0.2 : 0.17) * a ** 1.6)
          g.lineWidth = 0.5 + 1.1 * a
          const y0 = ys0[fr], y1 = ys1[to], dx = (x1 - x0) * 0.5
          g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + dx, y0, x1 - dx, y1, x1, y1); g.stroke()
        }
      }
      layer(w?.W1 ?? null, I, H, geo.xs[0], geo.xs[1], geo.ys[0], geo.ys[1])
      layer(w?.W2 ?? null, H, O, geo.xs[1], geo.xs[2], geo.ys[1], geo.ys[2])
      cache.current = { canvas: off, key }
      return off
    }

    let raf = 0
    let last = performance.now()
    let nextAmbient = last + 600
    const flashed = new Set<string>()

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) return
      const dt = Math.min(64, now - last); last = now
      const p = live.current
      const d = disp.current, t = target.current
      const k = 1 - Math.exp(-dt / 140)
      for (let i = 0; i < I; i++) d.x[i] += (t.x[i] - d.x[i]) * k
      if (now >= t.hAt) for (let j = 0; j < H; j++) d.h[j] += (t.h[j] - d.h[j]) * k
      if (now >= t.oAt) for (let o = 0; o < O; o++) d.o[o] += (t.o[o] - d.o[o]) * k

      // Ambient: a faint signal now and then along a strong path, so the network breathes.
      if (!reduced.current && now > nextAmbient && strong.current.length && signals.current.length < 6) {
        const e = strong.current[Math.floor(Math.random() ** 2 * strong.current.length)]
        signals.current.push({ ...e, start: now, dur: HOP_MS * 1.6, s: 0.18 + 0.12 * e.s })
        nextAmbient = now + 700 + Math.random() * 900
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(drawEdges(p.weights), 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Signals: a short luminous trail along the real edge curve.
      ctx.globalCompositeOperation = glowOp
      const alive: Signal[] = []
      for (const s of signals.current) {
        const u = (now - s.start) / s.dur
        if (u < 0) { alive.push(s); continue }
        if (u > 1.25) continue
        alive.push(s)
        const head = ease(Math.min(1, u))
        const fade = u > 1 ? 1 - (u - 1) / 0.25 : 1
        const x0 = geo.xs[s.layer - 1], x1 = geo.xs[s.layer]
        const y0 = geo.ys[s.layer - 1][s.from], y1 = geo.ys[s.layer][s.to]
        const tail = Math.max(0, head - 0.42)
        ctx.lineCap = 'round'
        const N = 14
        let [px, py] = bez(x0, y0, x1, y1, tail)
        for (let q = 1; q <= N; q++) {
          const tt = tail + ((head - tail) * q) / N
          const [qx, qy] = bez(x0, y0, x1, y1, tt)
          ctx.strokeStyle = rgba(accent, (q / N) ** 1.6 * s.s * fade)
          ctx.lineWidth = 0.6 + 2.6 * s.s * (q / N)
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke()
          px = qx; py = qy
        }
        const sz = 14 + 26 * s.s
        ctx.globalAlpha = Math.min(1, 1.1 * s.s) * fade
        ctx.drawImage(sprite, px - sz / 2, py - sz / 2, sz, sz)
        ctx.globalAlpha = 1
        if (u >= 1 && s.s > (s.layer === 2 ? 0.45 : 0.8)) {
          const key = `${s.layer}:${s.to}:${Math.round(s.start / 400)}`
          if (!flashed.has(key)) { flashed.add(key); flashes.current.push({ layer: (s.layer + 1) as 2 | 3, node: s.to, start: now }) }
        }
      }
      signals.current = alive
      if (flashed.size > 400) flashed.clear()

      // Arrival flashes.
      flashes.current = flashes.current.filter((f) => now - f.start < 700)
      for (const f of flashes.current) {
        const a = 1 - (now - f.start) / 700
        const x = geo.xs[f.layer - 1], y = geo.ys[f.layer - 1][f.node]
        ctx.strokeStyle = rgba(accent, 0.4 * a * a)
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(x, y, 6 + (1 - a) * 9, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.globalCompositeOperation = 'source-over'

      // Nodes: drawn by the CSS engine's own elements when it is live; canvas only as fallback.
      if (live.current.cssNodes) return
      let hMax = 1e-6, oMax = 1e-6, top = 0
      for (let j = 0; j < H; j++) hMax = Math.max(hMax, d.h[j])
      for (let o = 0; o < O; o++) { if (d.o[o] > oMax) { oMax = d.o[o]; top = o } }
      const node = (x: number, y: number, r: number, fill: string, ring: string) => {
        ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = ring; ctx.lineWidth = 1; ctx.stroke()
      }
      for (let i = 0; i < I; i++) {
        const v = Math.min(1, Math.abs(d.x[i]) / 2.5)
        node(geo.xs[0], geo.ys[0][i], 2.6 + 1.6 * v, rgba(fg, 0.12 + 0.6 * v), rgba(fg, 0.22))
      }
      ctx.globalCompositeOperation = glowOp
      for (let j = 0; j < H; j++) {
        const v = Math.max(0, d.h[j]) / hMax
        if (v > 0.05) { const sz = 14 + 22 * v; ctx.globalAlpha = 0.55 * v; ctx.drawImage(sprite, geo.xs[1] - sz / 2, geo.ys[1][j] - sz / 2, sz, sz); ctx.globalAlpha = 1 }
      }
      ctx.globalCompositeOperation = 'source-over'
      for (let j = 0; j < H; j++) {
        const v = Math.max(0, d.h[j]) / hMax
        node(geo.xs[1], geo.ys[1][j], 2.6 + 2.6 * v, v > 0.02 ? rgba(accent, 0.3 + 0.7 * v) : rgba(fg, 0.1), rgba(fg, v > 0.02 ? 0 : 0.14))
      }
      for (let o = 0; o < O; o++) {
        const v = d.o[o] / oMax
        const r = 3.5 + 4.5 * v
        if (o === top) {
          ctx.globalCompositeOperation = glowOp
          ctx.globalAlpha = 0.8; ctx.drawImage(sprite, geo.xs[2] - 22, geo.ys[2][o] - 22, 44, 44); ctx.globalAlpha = 1
          ctx.globalCompositeOperation = 'source-over'
        }
        node(geo.xs[2], geo.ys[2][o], r, o === top ? rgba(accent, 1) : rgba(accent, 0.12 + 0.6 * v), o === top ? rgba(accent, 0) : rgba(fg, 0.16))
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [width, height, dark, I, H, O])

  // Output labels as real text, aligned to the output nodes.
  const geo = width ? geometry(width, height, [I, H, O]) : null
  let top = 0
  outV.forEach((v, k) => { if (v > (outV[top] ?? 0)) top = k })
  const wsig = props.weights ? Array.from(props.weights.W1).reduce((a, b) => a + Math.abs(b), 0).toFixed(3) : 'none'

  return (
    <div
      ref={wrapRef}
      data-testid="network-view"
      data-top={props.outIds[vis[top]]}
      data-weights={wsig}
      className="relative w-full select-none"
      style={{ height }}
      role="img"
      aria-label={`Network: ${I} inputs, ${H} hidden, ${props.outIds.length} outputs, ${O} in scope. Top: ${props.outLabels[vis[top]]}.`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        ref={props.hostRef}
        data-testid="cssnet-host"
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={geo ? hostVars(geo, props.outLabels, vis, I, H) : undefined}
      />
      {geo && width >= 560 && (props.inputLabels ?? []).slice(0, I).map((l, i) => (
        <div
          key={i}
          className="absolute -translate-y-1/2 truncate text-right text-[11px] leading-none text-muted"
          style={{ left: 0, top: geo.ys[0][i], width: IN_LABEL_W }}
        >
          {l}
        </div>
      ))}
      {geo && !props.cssNodes && vis.map((ko, k) => (
        <div
          key={ko}
          data-testid="network-output"
          data-action={props.outIds[ko]}
          className={`absolute flex -translate-y-1/2 items-baseline gap-2 text-xs ${k === top ? 'font-medium text-foreground' : 'text-muted'}`}
          style={{ left: geo.xs[2] + 14, top: geo.ys[2][k], width: width < 560 ? 90 : LABEL_W }}
        >
          <span className="truncate">{props.outLabels[ko]}</span>
          <span className="ml-auto tabular-nums opacity-70">{((outV[k] ?? 0) * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  )
}
