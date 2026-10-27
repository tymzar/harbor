// r1-probes: smaller questions. (1) anchor-size() on non-positioned element, (2) do transforms move a view-timeline subject?,
// (3) @container style() range queries as thresholds, (4) can CSS express a cycle (recurrence)?  (5) steps() running clock as a time-multiplexer
import { withPage } from './r1-harness.mjs'
const html = `<!doctype html><html><head><style>
@property --h { syntax: '<number>'; inherits: true; initial-value: 0; }
@property --y { syntax: '<number>'; inherits: false; initial-value: 0; }
@property --q { syntax: '<number>'; inherits: false; initial-value: 0; }
/* 1: anchor-size */
.a1 { width: 333px; height: 2px; anchor-name: --a1; }
.a1r { width: anchor-size(--a1 width, 1px); height: 2px; }
.a1abs { position: absolute; width: anchor-size(--a1 width, 1px); height: 2px; }
/* 2: transform vs view-timeline */
#t2 { timeline-scope: --s2; }
.sc2 { width: 1000px; height: 10px; overflow: hidden; display: flex; }
.sp2 { flex: none; width: 500px; height: 10px; }
.sb2 { flex: none; width: 100px; height: 10px; view-timeline: --s2 inline; transform: translateX(var(--tx, 0px)); }
@keyframes ky { from { --y: 0 } to { --y: 1 } }
.r2 { animation: ky linear both; animation-timeline: --s2; animation-range: cover; }
/* 3: style query threshold */
.c3 { container-name: c3; }
.r3 { --q: 0; }
@container style(--h: 1) { .r3 { --q: 1; } }
@container style(--h > 0.5) { .r3 { --q: 2; } }
/* 4: cycle: --h on an element depends on child? impossible by construction; test self-cycle via var */
.c4 { --a: calc(var(--b) + 1); --b: calc(var(--a) + 1); }
/* 5: steps clock: running animation on --h with steps(4), child's delay reads via em bridge each frame */
@keyframes clk { from { --h: 0 } to { --h: 4 } }
.c5 { animation: clk 400ms steps(4, jump-none) infinite; }
.c5f { font-size: calc((var(--h) + 1) * 1px); }
@keyframes k5 { from { --y: 0 } to { --y: 10 } }
.c5r { animation: k5 10s linear paused both; animation-delay: calc(((1em / 1px) - 1) * -1s); }
</style></head><body>
<div class="a1"></div><div class="a1r"></div><div class="a1abs"></div>
<div id="t2"><div class="sc2"><div class="sp2"></div><div class="sb2"></div></div><div class="r2"></div></div>
<div class="c3"><div class="r3"></div></div>
<div class="c4"></div>
<div class="c5"><div class="c5f"><div class="c5r"></div></div></div>
</body></html>`
await withPage(async page => {
  const r = await page.evaluate(async () => {
    const raf = () => new Promise(r => requestAnimationFrame(r))
    const out = {}
    out.anchorSize = { nonPositioned: getComputedStyle(document.querySelector('.a1r')).width, abspos: getComputedStyle(document.querySelector('.a1abs')).width, supportsNonPositioned: CSS.supports('width: anchor-size(--a width)') }
    await raf(); await raf()
    const r2 = document.querySelector('.r2'), sb2 = document.querySelector('.sb2')
    const y0 = getComputedStyle(r2).getPropertyValue('--y')
    sb2.style.setProperty('--tx', '-300px'); await raf(); await raf()
    const y1 = getComputedStyle(r2).getPropertyValue('--y')
    out.transformVsViewTimeline = { untransformed: y0, translatedMinus300: y1, expectedIfTransformsCount: ((1000 - 200) / 1100).toFixed(5), expectedIfIgnored: ((1000 - 500) / 1100).toFixed(5) }
    const c3 = document.querySelector('.c3'), r3 = document.querySelector('.r3')
    const q = []
    for (const v of ['0', '0.7', '1']) { c3.style.setProperty('--h', v); q.push({ h: v, q: getComputedStyle(r3).getPropertyValue('--q') }) }
    out.styleQuery = q
    const c4 = getComputedStyle(document.querySelector('.c4')); out.cycle = { a: c4.getPropertyValue('--a'), b: c4.getPropertyValue('--b') }
    const c5r = document.querySelector('.c5r'); const seq = []
    for (let i = 0; i < 8; i++) { seq.push(getComputedStyle(c5r).getPropertyValue('--y')); await new Promise(r => setTimeout(r, 60)) }
    out.stepsClock = seq
    return out
  })
  console.log(JSON.stringify(r, null, 2))
}, { html })
