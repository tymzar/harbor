// r1-view-timeline: layout -> animation progress via view-timeline. Is it synchronous? How precise? How fast?
// Scroller width S, subject width w, spacer width p (driven by animated --h). Progress (cover) = (S - p) / (S + w).
import { withPage } from './r1-harness.mjs'
const S = 100000, W = 100
const css = `
@property --x { syntax: '<number>'; inherits: true; initial-value: 0; }
@property --h { syntax: '<number>'; inherits: true; initial-value: 0; }
@property --y { syntax: '<number>'; inherits: false; initial-value: 0; }
@keyframes k-h { from { --h: 0 } to { --h: 2 } }
@keyframes k-y { from { --y: 0 } to { --y: 1 } }
#root { timeline-scope: --subj; }
.l1 { animation: k-h 1s linear paused both; animation-delay: calc(var(--x) * -1s); }
.scroller { width: ${S}px; height: 10px; overflow: hidden; display: flex; }
.spacer { flex: none; width: calc(var(--h) * ${S/2}px); height: 10px; }
.subject { flex: none; width: ${W}px; height: 10px; view-timeline: --subj inline; }
.l2 { animation: k-y linear both; animation-timeline: --subj; animation-range: cover; }
`
const html = `<!doctype html><html><head><style>${css}</style></head><body><div id="root"><div class="l1"><div class="scroller"><div class="spacer"></div><div class="subject"></div></div><div class="l2"></div></div></div></body></html>`
await withPage(async page => {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  const r = await page.evaluate(async () => {
    const root = document.getElementById('root'), l2 = document.querySelector('.l2')
    const read = () => parseFloat(getComputedStyle(l2).getPropertyValue('--y'))
    const steps = []
    for (const x of [0.2, 0.7, 0.35]) {
      root.style.setProperty('--x', String(x))
      const s = { x, immediate: read() }
      await Promise.resolve(); s.microtask = read()
      await new Promise(r => setTimeout(r, 0)); s.macrotask = read()
      await new Promise(r => requestAnimationFrame(r)); s.rAF = read()
      await new Promise(r => requestAnimationFrame(r)); s.rAF2 = read()
      steps.push(s)
    }
    // precision sweep + timing (one rAF per eval)
    const xs = [], ys = []; for (let i = 0; i < 100; i++) xs.push(i / 99)
    const t0 = performance.now()
    for (const x of xs) { root.style.setProperty('--x', String(x)); await new Promise(r => requestAnimationFrame(r)); ys.push(read()) }
    const dt = (performance.now() - t0) / xs.length
    return { steps, xs, ys, msPerEval: dt }
  })
  for (const s of r.steps) console.log(`x=${s.x} expect=${((S - 2*s.x*S/2) / (S + W)).toFixed(6)}  immediate=${s.immediate} microtask=${s.microtask} macrotask=${s.macrotask} rAF=${s.rAF} rAF2=${s.rAF2}`)
  let maxErr = 0
  for (let i = 0; i < r.xs.length; i++) { const ref = (S - 2*r.xs[i]*S/2) / (S + W); maxErr = Math.max(maxErr, Math.abs(ref - r.ys[i])) }
  console.log(`precision sweep (S=${S}px): maxAbsErr on progress = ${maxErr.toExponential(2)}; ms/eval with one rAF wait = ${r.msPerEval.toFixed(2)}`)
}, { html })
