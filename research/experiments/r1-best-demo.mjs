// r1-best-demo: generates r1-best-demo.html — a 4-5-3 MLP whose ENTIRE forward pass runs in the CSS animation engine.
//   layer 1 (inputs -> hidden):  paused animations, delay = -x_i s, composition: add, bias = base value
//   bridge:                      font-size = (h + HOFF) px on a wrapper, next layer reads 1em (not animation-tainted)
//   layer 2 (hidden -> logits):  paused animations, delay from 1em, linear() relu easing, composition: add on the INHERITED
//                                partial sum (so the nested chain accumulates all hidden contributions)
//   softmax:                     exp() + division in calc() (division cannot be expressed in the animation engine)
// AUTO mode has ZERO JavaScript: the four inputs are running CSS animations on :root/.drive, bridged into the first layer
// through four independent unit channels (lh, rlh, rem, cqw). JS is only used for the manual sliders and the parity overlay.
import { writeFileSync } from 'node:fs'
import { withPage } from './r1-harness.mjs'
import { jsForward, HMIN, HMAX, HOFF, reluEasing } from './r1-mlp-gen.mjs'

const shape = { inputs: 4, hidden: 5, outputs: 3 }
const { inputs: I, hidden: H, outputs: O } = shape
let s = 20261022; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff * 2 - 1 }
const w = {
  W1: Float32Array.from({ length: H * I }, () => +(rnd() * 2.2).toFixed(3)), b1: Float32Array.from({ length: H }, () => +(rnd() * 0.8).toFixed(3)),
  W2: Float32Array.from({ length: O * H }, () => +(rnd() * 1.4).toFixed(3)), b2: Float32Array.from({ length: O }, () => +(rnd() * 0.3).toFixed(3)),
}
const DUR2 = HMAX - HMIN
const IX = 130, HX = 480, OX = 830
const iy = i => 130 + i * 105, hy = j => 90 + j * 105, oy = k => 140 + k * 160
const NAMES = ['explore', 'search', 'share']
const CH = ['calc(1lh / 100px)', 'calc(1rlh / 100px)', 'calc(1rem / 100px)', 'calc(100cqw / 1000px)'] // auto-mode input channels (numbers)

let css = `
:root { --d1: 0; --d2: 0; animation: d1 9s ease-in-out infinite alternate, d2 13s ease-in-out infinite alternate; line-height: calc(var(--d1) * 100px); font-size: calc(var(--d2) * 100px); }
@property --d0 { syntax: '<number>'; inherits: false; initial-value: 0.5; }
@property --d1 { syntax: '<number>'; inherits: false; initial-value: 0.5; }
@property --d2 { syntax: '<number>'; inherits: false; initial-value: 0.5; }
@property --d3 { syntax: '<number>'; inherits: false; initial-value: 0.5; }
@keyframes d0 { from { --d0: 0.05 } to { --d0: 0.95 } }
@keyframes d1 { from { --d1: 0.9 } to { --d1: 0.1 } }
@keyframes d2 { from { --d2: 0.2 } to { --d2: 1 } }
@keyframes d3 { from { --d3: 0.95 } to { --d3: 0.05 } }
@property --h { syntax: '<number>'; inherits: true; initial-value: 0; }
@property --v { syntax: '<number>'; inherits: true; initial-value: 0; }  /* inherits so ::after counters see it */
@property --a { syntax: '<number>'; inherits: true; initial-value: 0; }
@property --t { syntax: '<number>'; inherits: false; initial-value: 0; }
@property --win { syntax: '<number>'; inherits: true; initial-value: 0; }
`
for (let i = 0; i < I; i++) css += `@property --x${i} { syntax: '<number>'; inherits: true; initial-value: 0.5; }\n`
for (let k = 0; k < O; k++) css += `@property --o${k} { syntax: '<number>'; inherits: true; initial-value: 0; }\n@property --e${k} { syntax: '<number>'; inherits: true; initial-value: 0; }\n@property --p${k} { syntax: '<number>'; inherits: true; initial-value: 0; }\n`
css += `@property --z { syntax: '<number>'; inherits: true; initial-value: 1; }\n`
for (let j = 0; j < H; j++) for (let i = 0; i < I; i++) css += `@keyframes h${j}-${i} { from { --h: 0 } to { --h: ${w.W1[j * I + i]} } }\n`
for (let k = 0; k < O; k++) for (let j = 0; j < H; j++) css += `@keyframes o${k}-${j} { from { --o${k}: 0 } to { --o${k}: ${(w.W2[k * H + j] * HMAX).toFixed(4)} } }\n`
css += `
/* ---------- the network ---------- */
.drive { container-type: inline-size; width: calc(var(--d3) * 1000px); height: 0; line-height: calc(var(--d0) * 100px); animation: d0 7s ease-in-out infinite alternate, d3 11s ease-in-out infinite alternate; }
.root, .n, .f, .p, .out { display: contents; }
.root { ${Array.from({ length: O }, (_, k) => `--o${k}: ${w.b2[k]};`).join(' ')} }
.n { animation-duration: 1s; animation-timing-function: linear; animation-play-state: paused; animation-fill-mode: both; animation-composition: add;
     animation-delay: ${CH.map(c => `calc(${c} * -1s)`).join(', ')}; }
.stage:has(#manual:checked) .n { animation-delay: ${Array.from({ length: I }, (_, i) => `calc(var(--x${i}) * -1s)`).join(', ')}; }
.f { font-size: calc((var(--h) + ${HOFF}) * 1px); }
.p { animation-duration: ${DUR2}s; animation-timing-function: ${reluEasing()}; animation-play-state: paused; animation-fill-mode: both; animation-composition: add;
     animation-delay: calc(((1em / 1px) - ${HOFF} - ${HMIN}) * -1s); }
`
for (let j = 0; j < H; j++) {
  css += `.n${j} { --h: ${w.b1[j]}; animation-name: ${Array.from({ length: I }, (_, i) => `h${j}-${i}`).join(', ')}; }\n`
  css += `.p${j} { animation-name: ${Array.from({ length: O }, (_, k) => `o${k}-${j}`).join(', ')}; }\n`
}
css += `.out { ${Array.from({ length: O }, (_, k) => `--e${k}: calc(exp(var(--o${k})));`).join(' ')} --z: calc(${Array.from({ length: O }, (_, k) => `var(--e${k})`).join(' + ')}); ${Array.from({ length: O }, (_, k) => `--p${k}: calc(var(--e${k}) / var(--z));`).join(' ')} --win: max(${Array.from({ length: O }, (_, k) => `var(--p${k})`).join(', ')}); }\n`
// input value channels (auto) and manual override
for (let i = 0; i < I; i++) css += `.x${i} { --v: ${CH[i]}; }\n.stage:has(#manual:checked) .x${i} { --v: var(--x${i}); }\n`
css += `
/* ---------- visuals (all driven by the CSS-computed values) ---------- */
* { box-sizing: border-box; }
body { margin: 0; background: #07090f; color: #cfd6e6; font: 14px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; min-height: 100vh; display: grid; place-items: center; }
.stage { position: relative; width: 980px; height: 600px; background: radial-gradient(ellipse at 50% 40%, #0f1626 0%, #07090f 70%); border: 1px solid #1c2538; border-radius: 16px; overflow: hidden; font-size: 14px; line-height: 1.4; }
.title { position: absolute; left: 24px; top: 16px; font-size: 12px; white-space: nowrap; letter-spacing: .08em; text-transform: uppercase; color: #7f8ba6; }
.title b { color: #e6ecff; }
.col { position: absolute; top: 42px; font-size: 11px; color: #5d6a86; letter-spacing: .1em; text-transform: uppercase; }
.node { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; border: 2px solid #2a3652; background: #0d1322; display: grid; place-items: center; z-index: 2; }
.node::after { font-size: 11px; color: #e6ecff; }
.in { --a: var(--v); }
.in { background: color-mix(in oklab, #ffb347 calc(var(--a) * 100%), #0d1322); box-shadow: 0 0 calc(var(--a) * 28px) color-mix(in oklab, #ffb347 calc(var(--a) * 80%), transparent); border-color: color-mix(in oklab, #ffb347 calc(var(--a) * 100%), #2a3652); }
.in::after { counter-reset: ip calc(round(down, var(--v), 1)) fp calc(round(var(--v) * 100) - round(down, var(--v), 1) * 100); content: counter(ip) "." counter(fp, decimal-leading-zero); }
.hid { --a: max(0, min(1, var(--h) / 4)); --neg: max(0, min(1, var(--h) / -4));
       background: color-mix(in oklab, color-mix(in oklab, #37d7ff calc(var(--a) * 100%), #0d1322) calc(100% - var(--neg) * 100%), #ff3d8b);
       box-shadow: 0 0 calc(var(--a) * 36px) color-mix(in oklab, #37d7ff calc(var(--a) * 90%), transparent); border-color: color-mix(in oklab, #37d7ff calc(var(--a) * 100%), #2a3652); }
.hid::after { counter-reset: ip calc(round(down, abs(var(--h)), 1)) fp calc(round(abs(var(--h)) * 100) - round(down, abs(var(--h)), 1) * 100); content: counter(ip) "." counter(fp, decimal-leading-zero); }
@container style(--h < 0) { .hid::after { content: "-" counter(ip) "." counter(fp, decimal-leading-zero); color: #ffb3cf; } }
.hid i { position: absolute; inset: -8px; border-radius: 50%; border: 1px dashed #37d7ff55; opacity: calc(1 - var(--a)); }
.on { --a: var(--pk); width: 58px; height: 58px; margin: -29px 0 0 -29px;
      background: color-mix(in oklab, #7cff6b calc(var(--a) * 100%), #0d1322); box-shadow: 0 0 calc(var(--a) * 50px) color-mix(in oklab, #7cff6b calc(var(--a) * 90%), transparent); border-color: color-mix(in oklab, #7cff6b calc(var(--a) * 100%), #2a3652); }
.on::after { counter-reset: pc calc(round(var(--pk) * 100)); content: counter(pc) "%"; font-size: 13px; font-weight: 600; }
.on .ring { position: absolute; inset: -9px; border-radius: 50%; border: 2px solid #7cff6b; opacity: calc((var(--pk) - var(--win) + 0.0005) * 4000); box-shadow: 0 0 18px #7cff6b; }
.on .lab { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: 12px; white-space: nowrap; color: #9aa6c2; font-size: 12px; }
.on .lab::before { content: ""; display: block; height: 6px; width: calc(var(--pk) * 110px); margin: 0 auto 6px; border-radius: 3px; background: #7cff6b; box-shadow: 0 0 10px #7cff6b88; }
.ln { position: absolute; transform-origin: 0 50%; height: calc(var(--t) * 1px + 0.5px); border-radius: 2px; opacity: calc(0.12 + var(--t) / 10);
      background: repeating-linear-gradient(90deg, var(--c) 0 8px, transparent 8px 16px); animation: flow 0.9s linear infinite; z-index: 1; }
.ln.pos { --c: #37d7ff; } .ln.neg { --c: #ff3d8b; }
.ln.i { --t: calc(abs(var(--w)) * var(--v) * 7); }
.ln.o { --t: calc(abs(var(--w)) * max(0, min(4, var(--h))) * 2.2); }
@keyframes flow { to { background-position: 16px 0; } }
.ctl { position: absolute; left: 24px; bottom: 16px; display: flex; gap: 18px; align-items: center; font-size: 12px; color: #9aa6c2; }
.ctl label { display: flex; gap: 6px; align-items: center; }
.ctl input[type=range] { width: 90px; accent-color: #ffb347; }
.stage:not(:has(#manual:checked)) .ctl input[type=range] { opacity: .3; pointer-events: none; }
.par { position: absolute; right: 24px; bottom: 16px; font-size: 11px; color: #5d6a86; text-align: right; }
.par b { color: #7cff6b; }
.legend { position: absolute; left: 24px; bottom: 48px; font-size: 11px; color: #5d6a86; text-align: left; line-height: 1.6; }
.legend i { display: inline-block; width: 22px; height: 3px; vertical-align: middle; margin-left: 6px; }
`
// ---- DOM
const line = (x1, y1, x2, y2, extra) => { const L = Math.hypot(x2 - x1, y2 - y1), A = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI; return `<i class="ln ${extra.cls}" style="left:${x1}px;top:${y1}px;width:${L.toFixed(1)}px;transform:translateY(-50%) rotate(${A.toFixed(2)}deg);--w:${extra.w}"></i>` }
let body = `<div class="stage">
<div class="title"><b>CSS-only MLP 4-5-3</b> · both layers in the animation engine · em bridge · zero JS in auto mode</div>
<div class="legend">input → hidden: |w·x|<i style="background:#37d7ff"></i><i style="background:#ff3d8b"></i><br>hidden → logit: |w·relu(h)|<br>hidden shows h, output shows softmax %</div>
<div class="col" style="left:${IX - 24}px">inputs</div><div class="col" style="left:${HX - 24}px">hidden (relu)</div><div class="col" style="left:${OX - 28}px">actions</div>
<div class="drive"><div class="root">`
for (let i = 0; i < I; i++) body += `<i class="node in x${i}" style="left:${IX}px;top:${iy(i)}px"></i>`
for (let j = 0; j < H; j++) {
  body += `<div class="n n${j}"><div class="f">`
  body += `<i class="node hid" style="left:${HX}px;top:${hy(j)}px"><i></i></i>`
  for (let i = 0; i < I; i++) body += line(IX, iy(i), HX, hy(j), { cls: `i x${i} ${w.W1[j * I + i] >= 0 ? 'pos' : 'neg'}`, w: w.W1[j * I + i] })
  for (let k = 0; k < O; k++) body += line(HX, hy(j), OX, oy(k), { cls: `o ${w.W2[k * H + j] >= 0 ? 'pos' : 'neg'}`, w: w.W2[k * H + j] })
  body += `<div class="p p${j}">`
}
body += `<div class="out" data-role="out">`
for (let k = 0; k < O; k++) body += `<i class="node on" style="left:${OX}px;top:${oy(k)}px;--pk:var(--p${k})"><i class="ring"></i><span class="lab">${NAMES[k]}</span></i>`
body += `</div>`
for (let j = 0; j < H; j++) body += `</div></div></div>`
body += `</div></div>
<div class="ctl"><label><input type="checkbox" id="manual"> manual inputs</label>`
for (let i = 0; i < I; i++) body += `<label>x${i}<input type="range" min="0" max="1" step="0.01" value="0.5" oninput="this.closest('.stage').style.setProperty('--x${i}', this.value)"></label>`
body += `</div><div class="par" id="par">parity check loading…</div></div>`

const W = { W1: Array.from(w.W1), b1: Array.from(w.b1), W2: Array.from(w.W2), b2: Array.from(w.b2) }
const script = `
// Parity overlay only: reads the CSS-computed values and compares against a JS forward pass. Not part of the computation.
const W = ${JSON.stringify(W)}, I = ${I}, H = ${H}, O = ${O}, HMAX = ${HMAX};
const stage = document.querySelector('.stage'), out = document.querySelector('[data-role=out]'), hids = [...document.querySelectorAll('.node.hid')], ins = [...document.querySelectorAll('.node.in')];
window.__demo = { read() {
  const x = ins.map(e => parseFloat(getComputedStyle(e).getPropertyValue('--v')));
  const h = hids.map(e => parseFloat(getComputedStyle(e).getPropertyValue('--h')));
  const cs = getComputedStyle(out); const p = Array.from({ length: O }, (_, k) => parseFloat(cs.getPropertyValue('--p' + k)));
  return { x, h, p };
}, ref(x) {
  const h = Array.from({ length: H }, (_, j) => W.b1[j] + x.reduce((a, xi, i) => a + W.W1[j * I + i] * xi, 0));
  const o = Array.from({ length: O }, (_, k) => W.b2[k] + h.reduce((a, hj, j) => a + W.W2[k * H + j] * Math.max(0, Math.min(HMAX, hj)), 0));
  const m = Math.max(...o), e = o.map(v => Math.exp(v - m)), z = e.reduce((a, b) => a + b, 0);
  return { h, p: e.map(v => v / z) };
} };
(function tick() {
  const r = window.__demo.read(), ref = window.__demo.ref(r.x);
  let eh = 0, ep = 0; r.h.forEach((v, j) => eh = Math.max(eh, Math.abs(v - ref.h[j]))); r.p.forEach((v, k) => ep = Math.max(ep, Math.abs(v - ref.p[k])));
  document.getElementById('par').innerHTML = 'JS reference parity (read-only overlay)<br>max |Δhidden| = <b>' + eh.toExponential(1) + '</b> · max |Δprob| = <b>' + ep.toExponential(1) + '</b>';
  requestAnimationFrame(tick);
})();`
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>CSS-only MLP — animation-engine forward pass</title>
<style>${css}</style></head><body>${body}<script>${script}</script></body></html>`
const outPath = new URL('./r1-best-demo.html', import.meta.url).pathname
writeFileSync(outPath, html)
console.log('wrote', outPath, html.length, 'bytes')

// ---- verify: parity in auto mode (values moving) and manual mode (values set), plus a screenshot
await withPage(async page => {
  await page.setViewportSize({ width: 1100, height: 680 })
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  const auto = await page.evaluate(() => { const r = window.__demo.read(), ref = window.__demo.ref(r.x); return { r, ref } })
  const err = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])))
  console.log('AUTO  x=', auto.r.x.map(v => v.toFixed(3)).join(' '), '| maxErr hidden', err(auto.r.h, auto.ref.h).toExponential(2), 'probs', err(auto.r.p, auto.ref.p).toExponential(2), '| probs', auto.r.p.map(v => v.toFixed(3)).join(' '))
  await page.check('#manual')
  let worst = 0
  for (const xs of [[0.1, 0.9, 0.3, 0.7], [1, 1, 1, 1], [0, 0, 0, 0], [0.5, 0.2, 0.8, 0.05]]) {
    const m = await page.evaluate((xs) => { const st = document.querySelector('.stage'); xs.forEach((v, i) => st.style.setProperty('--x' + i, String(v))); const r = window.__demo.read(), ref = window.__demo.ref(xs); return { r, ref } }, xs)
    worst = Math.max(worst, err(m.r.h, m.ref.h), err(m.r.p, m.ref.p))
    console.log('MANUAL x=', xs.join(' '), '| read x', m.r.x.map(v => v.toFixed(2)).join(' '), '| hidden', m.r.h.map(v => v.toFixed(3)).join(' '), '| probs', m.r.p.map(v => v.toFixed(3)).join(' '), '| maxErr', Math.max(err(m.r.h, m.ref.h), err(m.r.p, m.ref.p)).toExponential(2))
  }
  console.log('manual worst maxAbsErr:', worst.toExponential(2))
  await page.uncheck('#manual')
  await page.evaluate(() => new Promise(r => setTimeout(r, 1500)))
  const shot = process.env.SHOT || '/tmp/r1-demo.png'
  await page.screenshot({ path: shot })
  console.log('screenshot', shot)
}, { html })
