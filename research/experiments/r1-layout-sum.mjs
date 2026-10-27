// r1-layout-sum: dot product as LAYOUT. Each input i is an element whose width is ANIMATED (keyframes 0 -> w_i*SCALE px,
// delay = -x_i s). Negative weights use margin-left (negative margins allowed). An inline-flex/max-content container sums them.
// The container is an inline-size container; a child reads the sum via 100cqw and feeds a second animation layer (delay).
import { withPage } from './r1-harness.mjs'
const w = [0.8, -0.5, 1.2, -0.3, 0.6], SCALE = 100, OFF = 1000 // px; OFF keeps total width positive
const N = w.length
let css = `@property --y { syntax: '<number>'; inherits: false; initial-value: 0; }\n`
for (let i = 0; i < N; i++) css += `@property --x${i} { syntax: '<number>'; inherits: true; initial-value: 0; }\n`
// NOTE: container-type: inline-size imposes inline-size CONTAINMENT, so the flex container itself cannot be the container
// (its max-content width becomes 0 - observed). Instead an abspos inset:0 child mirrors the container's width and is the container.
css += `.sum { display: flex; width: max-content; position: relative; height: 2px; }\n.sum > * { flex: none; height: 2px; }\n.sum .off { width: ${OFF}px }\n.reader { position: absolute; inset: 0; container-type: inline-size; }\n`
for (let i = 0; i < N; i++) {
  const prop = w[i] >= 0 ? 'width' : 'margin-left'
  css += `@keyframes k${i} { from { ${prop}: 0px } to { ${prop}: ${w[i] * SCALE}px } }\n.t${i} { width: 0; animation: k${i} 1s linear paused both; animation-delay: calc(var(--x${i}) * -1s); }\n`
}
css += `@keyframes k-y { from { --y: 0 } to { --y: 2 } }\n.l2 { animation: k-y ${20}s linear paused both; animation-delay: calc(((100cqw / 1px) - ${OFF}) / ${SCALE} * -1s - 10s); }\n`
// y = 2 * (t/20) where t = (sum/SCALE + 10) => y = (sum + 10)/10 ... keep simple: y = 2*((dot)+10)/20 = (dot+10)/10
let html = `<!doctype html><html><head><style>${css}</style></head><body><div id="root"><div class="sum"><div class="off"></div>`
for (let i = 0; i < N; i++) html += `<div class="t${i}"></div>`
html += `<div class="reader"><div class="l2"></div></div></div></div></body></html>`
await withPage(async page => {
  const r = await page.evaluate((N) => {
    const root = document.getElementById('root'), sum = document.querySelector('.sum'), l2 = document.querySelector('.l2')
    const trials = []
    let rng = 12345; const rand = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const t0 = performance.now()
    for (let t = 0; t < 200; t++) {
      const xs = []; for (let i = 0; i < N; i++) { const x = rand(); xs.push(x); root.style.setProperty('--x' + i, String(x)) }
      const y = parseFloat(getComputedStyle(l2).getPropertyValue('--y'))
      if (t < 200) trials.push({ xs, y, width: sum.getBoundingClientRect().width })
    }
    return { trials, usPerEval: (performance.now() - t0) / 200 * 1000 }
  }, N)
  let maxErr = 0, maxWErr = 0
  for (const t of r.trials) {
    const dot = w.reduce((a, wi, i) => a + wi * t.xs[i], 0)
    const refY = (dot + 10) / 10
    maxErr = Math.max(maxErr, Math.abs(refY - t.y)); maxWErr = Math.max(maxWErr, Math.abs(t.width - (OFF + dot * SCALE)))
  }
  const t = r.trials[0]; console.log('sample:', JSON.stringify(t), 'refY=', ((w.reduce((a, wi, i) => a + wi * t.xs[i], 0)) + 10) / 10)
  console.log(`layout-sum: N=${N} inputs, maxAbsErr(y)=${maxErr.toExponential(2)}, maxAbsErr(container width px)=${maxWErr.toExponential(2)}, usPerEval=${r.usPerEval.toFixed(1)} (includes a getBoundingClientRect)`)
}, { html })
