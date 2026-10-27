// r1-mlp-variants: where does the 1.3 ms/eval of the all-animation 15-16-8 go? Compare structures with the same shape/weights.
import { withPage } from './r1-harness.mjs'
import { genCss, genHtml, jsForward, randomWeights, HMAX } from './r1-mlp-gen.mjs'
const shape = { inputs: 15, hidden: 16, outputs: 8 }
const { inputs: I, hidden: H, outputs: O } = shape
const w = randomWeights(shape)

// --- pure calc baseline: everything on one element
function calcCss() {
  let css = ''
  for (let i = 0; i < I; i++) css += `@property --x${i} { syntax: '<number>'; inherits: true; initial-value: 0; }\n`
  for (let j = 0; j < H; j++) css += `@property --h${j} { syntax: '<number>'; inherits: false; initial-value: 0; }\n`
  for (let k = 0; k < O; k++) css += `@property --o${k} { syntax: '<number>'; inherits: false; initial-value: 0; }\n@property --p${k} { syntax: '<number>'; inherits: false; initial-value: 0; }\n`
  css += `.calc {`
  for (let j = 0; j < H; j++) css += ` --h${j}: calc(${w.b1[j]} ${Array.from({ length: I }, (_, i) => `+ ${w.W1[j * I + i]} * var(--x${i})`).join(' ')});`
  for (let k = 0; k < O; k++) css += ` --o${k}: calc(${w.b2[k]} ${Array.from({ length: H }, (_, j) => `+ ${w.W2[k * H + j]} * max(0, min(${HMAX}, var(--h${j})))`).join(' ')});`
  for (let k = 0; k < O; k++) css += ` --p${k}: calc(exp(var(--o${k})) / (${Array.from({ length: O }, (_, k2) => `exp(var(--o${k2}))`).join(' + ')}));`
  css += ` }\n`
  return css
}
// --- hybrid flat: H sibling elements each animating --h (layer 1 in animation), output layer calc on a sibling that reads... siblings can't be read.
// so hybrid = hidden neurons as NESTED elements (inherits:true) with distinct names --h{j}, and the calc output at the bottom.
function hybridCss() {
  let css = ''
  for (let i = 0; i < I; i++) css += `@property --x${i} { syntax: '<number>'; inherits: true; initial-value: 0; }\n`
  for (let j = 0; j < H; j++) css += `@property --h${j} { syntax: '<number>'; inherits: true; initial-value: 0; }\n`
  for (let k = 0; k < O; k++) css += `@property --o${k} { syntax: '<number>'; inherits: false; initial-value: 0; }\n@property --p${k} { syntax: '<number>'; inherits: false; initial-value: 0; }\n`
  for (let j = 0; j < H; j++) for (let i = 0; i < I; i++) css += `@keyframes h${j}-${i} { from { --h${j}: 0 } to { --h${j}: ${w.W1[j * I + i]} } }\n`
  css += `.n { animation-duration: 1s; animation-timing-function: linear; animation-play-state: paused; animation-fill-mode: both; animation-composition: add; animation-delay: ${Array.from({ length: I }, (_, i) => `calc(var(--x${i}) * -1s)`).join(', ')}; }\n`
  for (let j = 0; j < H; j++) css += `.n${j} { --h${j}: ${w.b1[j]}; animation-name: ${Array.from({ length: I }, (_, i) => `h${j}-${i}`).join(', ')}; }\n`
  css += `.out {`
  for (let k = 0; k < O; k++) css += ` --o${k}: calc(${w.b2[k]} ${Array.from({ length: H }, (_, j) => `+ ${w.W2[k * H + j]} * max(0, min(${HMAX}, var(--h${j})))`).join(' ')});`
  for (let k = 0; k < O; k++) css += ` --p${k}: calc(exp(var(--o${k})) / (${Array.from({ length: O }, (_, k2) => `exp(var(--o${k2}))`).join(' + ')}));`
  css += ` }\n`
  return css
}
// --- hybrid FLAT single element: all 240 hidden animations on ONE element (distinct --h{j}), calc output on a child
function hybridOneElCss() {
  let css = hybridCss().split('\n').filter(l => !l.startsWith('.n')).join('\n')
  css += `.one { animation-duration: 1s; animation-timing-function: linear; animation-play-state: paused; animation-fill-mode: both; animation-composition: add; ${Array.from({ length: H }, (_, j) => `--h${j}: ${w.b1[j]};`).join(' ')}
 animation-name: ${Array.from({ length: H }, (_, j) => Array.from({ length: I }, (_, i) => `h${j}-${i}`).join(', ')).join(', ')};
 animation-delay: ${Array.from({ length: H }, () => Array.from({ length: I }, (_, i) => `calc(var(--x${i}) * -1s)`).join(', ')).join(', ')}; }\n`
  return css
}
const nestedHtml = (cls) => { let h = `<div class="root" data-role="root">`; for (let j = 0; j < H; j++) h += `<div class="n n${j}">`; h += `<div class="out" data-role="out"></div>`; for (let j = 0; j < H; j++) h += `</div>`; return h + `</div>` }

const variants = [
  { name: 'A all-animation nested (em bridge) 15-16-8', css: genCss(shape, w), html: genHtml(shape) },
  { name: 'B hybrid: hidden animation (16 nested els, 240 anims) + calc output', css: hybridCss(), html: nestedHtml() },
  { name: 'C hybrid: hidden animation (ONE element, 240 anims) + calc output', css: hybridOneElCss(), html: `<div class="root one" data-role="root"><div class="out" data-role="out"></div></div>` },
  { name: 'D pure calc, one element', css: calcCss(), html: `<div class="calc root" data-role="root" data-out="self"></div>` },
]
for (const v of variants) {
  await withPage(async page => {
    const r = await page.evaluate(({ inputs: I, outputs: O }) => {
      const root = document.querySelector('[data-role=root]'); const out = root.dataset.out === 'self' ? root : document.querySelector('[data-role=out]')
      let s = 7; const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
      const run = (N, nInputs) => { const t0 = performance.now(); for (let t = 0; t < N; t++) { for (let i = 0; i < nInputs; i++) root.style.setProperty('--x' + i, String(rand())); const cs = getComputedStyle(out); let acc = 0; for (let k = 0; k < O; k++) acc += parseFloat(cs.getPropertyValue('--p' + k)) } return (performance.now() - t0) / N * 1000 }
      run(50, I)
      const all = run(300, I), one = run(300, 1)
      const x = Array.from({ length: I }, () => rand()); for (let i = 0; i < I; i++) root.style.setProperty('--x' + i, String(x[i]))
      const cs = getComputedStyle(out)
      return { all, one, x, probs: Array.from({ length: O }, (_, k) => parseFloat(cs.getPropertyValue('--p' + k))), anims: document.getAnimations().length }
    }, shape)
    const ref = jsForward(shape, w, r.x); let e = 0; for (let k = 0; k < O; k++) e = Math.max(e, Math.abs(ref.probs[k] - r.probs[k]))
    console.log(`${v.name}: ${r.all.toFixed(0)} us/eval (all 15 inputs change), ${r.one.toFixed(0)} us/eval (1 input changes); anims=${r.anims}; maxAbsErr probs=${e.toExponential(2)}`)
  }, { html: `<!doctype html><html><head><style>${v.css}</style></head><body>${v.html}</body></html>` })
}
