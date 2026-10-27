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
.cn-pattern__base{position:absolute;left:50%;top:50%;width:160vmax;height:160vmax;margin:-80vmax 0 0 -80vmax;border-radius:50%;
  background:
    radial-gradient(circle at 30% 30%, oklch(78% 0.17 300 / .55) 0, transparent 38%),
    radial-gradient(circle at 70% 65%, oklch(80% 0.16 200 / .5) 0, transparent 42%),
    conic-gradient(from 0deg, oklch(45% 0.19 290), oklch(55% 0.16 220), oklch(70% 0.15 80), oklch(60% 0.2 350), oklch(45% 0.19 290));
  will-change:filter,transform;
  filter:hue-rotate(calc(var(--cn-g0) * 160deg)) saturate(calc(0.7 + var(--cn-g1) * 1.1)) contrast(calc(0.85 + var(--cn-g2) * 0.6)) brightness(calc(0.75 + var(--cn-g3) * 0.6)) blur(calc(28px + var(--cn-g11) * 30px));
  transform:rotate(calc(var(--cn-g4) * 120deg - 30deg)) scale(calc(0.9 + var(--cn-g5) * 0.3)) translate(calc(var(--cn-g6) * 8vmax - 4vmax), calc(var(--cn-g7) * 8vmax - 4vmax))}
.cn-pattern__glow{position:absolute;left:50%;top:50%;width:70vmax;height:70vmax;margin:-35vmax 0 0 -35vmax;border-radius:50%;
  background:radial-gradient(circle, oklch(85% 0.14 160 / .6) 0, oklch(70% 0.2 320 / .25) 35%, transparent 62%);
  mix-blend-mode:screen;will-change:transform,opacity,filter;
  opacity:calc(0.25 + var(--cn-g8) * 0.6);
  filter:hue-rotate(calc(var(--cn-g12) * 200deg)) blur(calc(10px + var(--cn-g13) * 20px));
  transform:translate(calc(var(--cn-g9) * 50vmax - 25vmax), calc(var(--cn-g10) * 50vmax - 25vmax)) scale(calc(0.8 + var(--cn-g14) * 0.7))}
.cn-pattern__grain{position:absolute;inset:0;mix-blend-mode:overlay;opacity:calc(0.15 + var(--cn-g15) * 0.35);
  background:repeating-linear-gradient(115deg, transparent 0 7px, oklch(100% 0 0 / .05) 7px 8px);will-change:opacity}

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
