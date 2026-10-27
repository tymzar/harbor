// r1-em-chain: how many animation layers can be chained through the em bridge, how fast, how precise?
// Each layer = 2 elements: .n (neuron: animates --y, delay read from INHERITED font-size via 1em; must NOT set font-size)
//                           > .f (bridge: font-size = (--y inherited from .n + OFF) px)
// y_l = BIAS + GAIN * relu(y_{l-1} - SHIFT).  Activation via linear() easing, bias via base value + composition:add.
// LESSON (first attempt failed): 'em' inside animation-delay refers to the element's OWN font-size, which is resolved from the
// BASE value of --y (before animations apply). So producer (font-size) and consumer (delay) must be different elements.
import { withPage } from './r1-harness.mjs'

const OFF = 64, TMIN = -4, TMAX = 4, DUR = TMAX - TMIN
const SHIFT = 0.3, GAIN = 1.5, BIAS = 0.1
const act = v => GAIN * Math.max(0, Math.min(TMAX, Math.max(TMIN, v)) - SHIFT) + BIAS  // clamped to the sampled range like CSS
const jsChain = (x, L) => { let y = x; for (let l = 0; l < L; l++) y = act(y); return y }
const tKnee = (SHIFT - TMIN) / DUR
const easing = `linear(0, 0 ${(tKnee*100).toFixed(6)}%, 1)`

function build(L, off = OFF) {
  const css = `@property --y { syntax: '<number>'; inherits: true; initial-value: 0; }
@property --x { syntax: '<number>'; inherits: true; initial-value: 0; }
@keyframes k { from { --y: 0 } to { --y: ${GAIN * (TMAX - SHIFT)} } }
.n { --y: ${BIAS}; animation: k ${DUR}s ${easing} paused both; animation-composition: add; }
.n.first { animation-delay: calc((var(--x) - ${TMIN}) * -1s); }
.n.rest { animation-delay: calc(((1em / 1px) - ${off} - ${TMIN}) * -1s); }
.f { font-size: calc((var(--y) + ${off}) * 1px); }
`
  let html = ''
  for (let l = 0; l < L; l++) html += `<div class="n ${l === 0 ? 'first' : 'rest'}" id="n${l}"><div class="f">`
  for (let l = 0; l < L; l++) html += `</div></div>`
  return `<!doctype html><html><head><style>${css}</style></head><body><div id="root">${html}</div></body></html>`
}

console.log('--- depth / timing / precision (inputs x in [-1,1], 200 evals each) ---')
for (const L of [1, 2, 3, 4, 8, 16, 32, 64, 128, 256]) {
  await withPage(async page => {
    const r = await page.evaluate(({ L }) => {
      const root = document.getElementById('root'), last = document.getElementById('n' + (L - 1))
      const xs = []; for (let i = 0; i < 200; i++) xs.push(-1 + 2 * (i / 199))
      const ys = []
      const t0 = performance.now()
      for (const x of xs) { root.style.setProperty('--x', String(x)); ys.push(parseFloat(getComputedStyle(last).getPropertyValue('--y'))) }
      const dt = (performance.now() - t0) / xs.length
      root.style.setProperty('--x', '0.9'); const sync = parseFloat(getComputedStyle(last).getPropertyValue('--y'))
      return { xs, ys, usPerEval: dt * 1000, sync }
    }, { L })
    let maxErr = 0, maxRef = 0
    for (let i = 0; i < r.xs.length; i++) { const ref = jsChain(r.xs[i], L); maxRef = Math.max(maxRef, Math.abs(ref)); maxErr = Math.max(maxErr, Math.abs(ref - r.ys[i])) }
    const refSync = jsChain(0.9, L)
    console.log(`L=${String(L).padStart(3)} layers: maxAbsErr=${maxErr.toExponential(2)} (max|ref|=${maxRef.toFixed(3)})  usPerEval=${r.usPerEval.toFixed(1)}  sync read x=0.9 -> ${r.sync} (ref ${refSync.toFixed(6)}) ${Math.abs(r.sync-refSync)<1e-3?'OK':'MISMATCH'}`)
  }, { html: build(L) })
}

console.log('\n--- font-size carrier precision: parent --y set directly (no animation), child reads via em, L=2 identity-ish probe ---')
await withPage(async page => {
  // probe: set --y on the first .f directly through its parent, read child's delay (a time) to see font-size quantisation
  const r = await page.evaluate(() => {
    const f = document.querySelector('.f'), n1 = document.getElementById('n1')
    const out = []
    for (const v of [0, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 0.123456789, 1.000001, 3.14159265358979, 63.999, 1000.5, 1e5, 1e6, 1e7, 3e7, -63.5, -64, -70]) {
      f.style.setProperty('--y', String(v))
      out.push({ v, fontSize: getComputedStyle(f).fontSize, delay: getComputedStyle(n1).animationDelay })
    }
    return out
  })
  for (const o of r) console.log(`  --y=${o.v}  font-size=${o.fontSize}  child delay=${o.delay}  (expect ${(-(o.v - TMIN))}s)`)
}, { html: build(2) })
