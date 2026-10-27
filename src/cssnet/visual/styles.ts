/**
 * Styles for the visual layers, injected once per document. Kept in a <style>
 * element (not a .css import) so the module is self-contained for any bundler
 * and for the jsdom test environment.
 *
 * Per research R2: every per-frame change is on compositor properties
 * (transform / filter / opacity) with will-change, and the gradients are painted once.
 * matrix3d() entries must be unitless numbers (Chromium rejects px in the translation
 * row, verified: the whole transform computes to none).
 */

const N_F = 16

const regs = Array.from({ length: N_F }, (_, i) => `@property --cn-f${i}{syntax:'<number>';inherits:true;initial-value:0}\n@property --cn-g${i}{syntax:'<number>';inherits:true;initial-value:0}`).join('\n')
/** squash relu activations into [0,1): g = h / (1 + h) (computed in CSS). */
const squash = Array.from({ length: N_F }, (_, i) => `--cn-g${i}:calc(max(0, var(--cn-f${i})) / (1 + max(0, var(--cn-f${i}))))`).join(';')
const transitions = Array.from({ length: N_F }, (_, i) => `--cn-f${i} 520ms cubic-bezier(.22,.61,.36,1)`).join(',')

export const VISUAL_CSS = `${regs}
.cn-pattern{position:absolute;inset:0;overflow:hidden;pointer-events:none;isolation:isolate;${squash};transition:${transitions}}
.cn-pattern__base{position:absolute;left:50%;top:50%;width:140vmax;height:140vmax;margin:-70vmax 0 0 -70vmax;
  background:
    radial-gradient(closest-side at 32% 38%, oklch(72% 0.09 255 / .42), transparent),
    radial-gradient(closest-side at 70% 62%, oklch(80% 0.06 200 / .34), transparent);
  will-change:filter,transform;
  filter:hue-rotate(calc(var(--cn-g0) * 36deg - 18deg)) saturate(calc(0.8 + var(--cn-g1) * 0.5)) blur(calc(56px + var(--cn-g11) * 24px));
  transform:rotate(calc(var(--cn-g4) * 40deg - 20deg)) scale(calc(0.92 + var(--cn-g5) * 0.16)) translate(calc(var(--cn-g6) * 6vmax - 3vmax), calc(var(--cn-g7) * 6vmax - 3vmax))}
.cn-pattern__glow{position:absolute;left:50%;top:50%;width:60vmax;height:60vmax;margin:-30vmax 0 0 -30vmax;
  background:radial-gradient(closest-side, oklch(82% 0.05 270 / .35), transparent);
  will-change:transform,opacity,filter;
  opacity:calc(0.35 + var(--cn-g8) * 0.4);
  filter:blur(calc(40px + var(--cn-g13) * 20px)) hue-rotate(calc(var(--cn-g12) * 30deg - 15deg));
  transform:translate(calc(var(--cn-g9) * 30vmax - 15vmax), calc(var(--cn-g10) * 30vmax - 15vmax)) scale(calc(0.85 + var(--cn-g14) * 0.3))}
.cn-pattern__grain{position:absolute;inset:0;opacity:calc(0.035 + var(--cn-g15) * 0.02);will-change:opacity;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

.cn-dotgrid{position:relative;perspective:var(--cn-persp, 700px);display:grid;place-items:center;overflow:hidden;pointer-events:none;${squash};transition:${transitions}}
.cn-dotgrid__m{width:var(--cn-size, 240px);height:var(--cn-size, 240px);will-change:transform}
.cn-dotgrid__m1{transform:matrix3d(
  calc(1 + var(--cn-g0) * 0.5), calc(var(--cn-g1) * 0.6 - 0.3), 0, calc(var(--cn-g2) * 0.003 - 0.0015),
  calc(var(--cn-g3) * 0.6 - 0.3), calc(1 + var(--cn-g4) * 0.5), 0, calc(var(--cn-g5) * 0.003 - 0.0015),
  0, 0, 1, 0,
  calc(var(--cn-g6) * 40 - 20), calc(var(--cn-g7) * 40 - 20), 0, 1)}
.cn-dotgrid__m2{transform:matrix3d(
  calc(1 - var(--cn-g8) * 0.4), calc(0.3 - var(--cn-g9) * 0.6), 0, calc(0.0012 - var(--cn-g10) * 0.0024),
  calc(var(--cn-g11) * 0.6 - 0.3), calc(1 - var(--cn-g12) * 0.4), 0, calc(var(--cn-g13) * 0.0024 - 0.0012),
  0, 0, 1, 0,
  0, 0, calc(var(--cn-g14) * -120), 1)}
.cn-dotgrid__m3{transform:rotate(calc(var(--cn-g15) * 50deg - 25deg))}
.cn-dotgrid__dots{width:100%;height:100%;border-radius:12px;
  background-image:radial-gradient(circle, var(--cn-dot, oklch(90% 0.05 260)) 1.5px, transparent 2.3px);
  background-size:14px 14px;background-position:7px 7px}
`

let injected: WeakSet<Document> | null = null

export function ensureVisualStyles(doc: Document): void {
  injected ??= new WeakSet()
  if (injected.has(doc)) return
  injected.add(doc)
  const s = doc.createElement('style')
  s.dataset.cssnet = 'visual'
  s.textContent = VISUAL_CSS
  doc.head.appendChild(s)
}

/** Inline style setting --cn-f0..15 from an activation vector (cycled if shorter). */
export function activationVars(hidden: ArrayLike<number> | undefined, n = N_F): Record<string, string> {
  const out: Record<string, string> = {}
  const len = hidden?.length ?? 0
  for (let i = 0; i < n; i++) {
    const v = len ? Number(hidden![i % len]) : 0
    out[`--cn-f${i}`] = Number.isFinite(v) ? Number(v.toPrecision(6)).toString() : '0'
  }
  return out
}
