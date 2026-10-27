// r1-taint-matrix: which channels launder animation-taint so an animated layer can feed another animation layer?
// Layer 1: --h animated (paused, delay = -x s, keyframes 0 -> 2, fill both) => h = 2x.
// Layer 2: --y animated, delay derived from h via a channel, keyframes 0 -> 3 => y = 3h = 6x expected.
import { withPage } from './r1-harness.mjs'

const css = `
@property --x { syntax: '<number>'; inherits: true; initial-value: 0; }
@property --h { syntax: '<number>'; inherits: true; initial-value: 0; }
@property --y { syntax: '<number>'; inherits: false; initial-value: 0; }
@keyframes k-h { from { --h: 0 } to { --h: 2 } }
@keyframes k-y { from { --y: 0 } to { --y: 3 } }
@keyframes k-w { from { width: 0px } to { width: 200px } }
.l1 { animation: k-h 1s linear paused both; animation-delay: calc(var(--x) * -1s); }
.l2 { animation: k-y 1s linear paused both; }
/* A: direct var() of animated prop */
.A .l2 { animation-delay: calc(var(--h) * -1s); }
/* B: var() of INHERITED animated prop (l2 is grandchild; mid element does nothing) */
.B .l2 { animation-delay: calc(var(--h) * -1s); }
/* C: em bridge: parent font-size = h px, child delay = -(1em/1px) s */
.C .l1 { font-size: calc(var(--h) * 1px); }
.C .l2 { animation-delay: calc(1em / 1px * -1s); }
/* D: cqw bridge: parent is inline-size container with width = h*100px, child delay from 1cqw */
.D .l1 { container-type: inline-size; width: calc(var(--h) * 100px); height: 1px; }
.D .l2 { animation-delay: calc(1cqw / 1px * -1s); }
/* E: view-timeline bridge: spacer width = h*100px pushes subject in a 1000px scroller; l2 animation progress = view progress */
.E .l1 { timeline-scope: --subj; }
.E .scroller { width: 1000px; height: 10px; overflow: hidden; display: flex; }
.E .scroller .spacer { flex: none; width: calc(var(--h) * 100px); height: 10px; }
.E .scroller .subject { flex: none; width: 100px; height: 10px; view-timeline: --subj inline; }
.E .l2 { animation: k-y linear both; animation-timeline: --subj; animation-range: cover; }
/* F: transition on a custom prop (not keyframes) -> var() in delay. Is a transitioned value tainted? */
.F .l1 { --ht: 0; transition: --ht 0.001s; }
.F .l1.on { --ht: 0.5; }
.F .l2 { animation-delay: calc(var(--ht) * -1s); }
/* G: animated NON-custom property (width) -> cqw -> delay */
.G .l1 { container-type: inline-size; height: 1px; animation: k-w 1s linear paused both; animation-delay: calc(var(--x) * -1s); }
.G .l2 { animation-delay: calc(1cqw / 1px * -1s); }
/* H: lh unit bridge (line-height) */
.H .l1 { line-height: calc(var(--h) * 1px); }
.H .l2 { animation-delay: calc(1lh / 1px * -1s); }
`
const html = `<!doctype html><html><head><style>${css}</style></head><body>
<div id="A" class="A"><div class="l1"><div class="l2"></div></div></div>
<div id="B" class="B"><div class="l1"><div><div class="l2"></div></div></div></div>
<div id="C" class="C"><div class="l1"><div class="l2"></div></div></div>
<div id="D" class="D"><div class="l1"><div class="l2"></div></div></div>
<div id="E" class="E"><div class="l1"><div class="scroller"><div class="spacer"></div><div class="subject"></div></div><div class="l2"></div></div></div>
<div id="F" class="F"><div class="l1"><div class="l2"></div></div></div>
<div id="G" class="G"><div class="l1"><div class="l2"></div></div></div>
<div id="H" class="H"><div class="l1"><div class="l2"></div></div></div>
</body></html>`

await withPage(async page => {
  const sup = await page.evaluate(() => ({
    lenDiv: CSS.supports('animation-delay: calc(1em / 1px * -1s)'),
    cqDiv: CSS.supports('animation-delay: calc(1cqw / 1px * -1s)'),
  }))
  console.log('supports length/length division in animation-delay:', JSON.stringify(sup))
  const ids = ['A','B','C','D','E','F','G','H']
  for (const x of [0.25, 0.4]) {
    const r = await page.evaluate((x) => {
      const out = {}
      for (const id of ['A','B','C','D','E','F','G','H']) {
        const root = document.getElementById(id)
        root.style.setProperty('--x', String(x))
        if (id === 'F') root.querySelector('.l1').classList.add('on')
        const l1 = root.querySelector('.l1'), l2 = root.querySelector('.l2')
        const cs1 = getComputedStyle(l1), cs2 = getComputedStyle(l2)
        out[id] = { h: cs1.getPropertyValue('--h'), ht: cs1.getPropertyValue('--ht'), delay2: cs2.animationDelay, y: cs2.getPropertyValue('--y') }
      }
      return out
    }, x)
    console.log(`\n--- x = ${x} (expect h = ${2*x}, y = ${6*x}; E expects y = 3*(1000-${x*200})/1100 = ${(3*(1000-x*200)/1100).toFixed(4)}; F expects y = 1.5) ---`)
    for (const [k, v] of Object.entries(r)) console.log(k, JSON.stringify(v))
    const rLater = await page.evaluate(async () => {
      const read = () => { const l2 = document.querySelector('#E .l2'); const a = l2.getAnimations()[0]; return { y: getComputedStyle(l2).getPropertyValue('--y'), tl: a && a.timeline && a.timeline.constructor.name, prog: a && a.timeline && a.timeline.currentTime && a.timeline.currentTime.value, F: getComputedStyle(document.querySelector('#F .l2')).getPropertyValue('--y') } }
      const r0 = read()
      await new Promise(r => requestAnimationFrame(r)); const r1 = read()
      await new Promise(r => requestAnimationFrame(r)); const r2 = read()
      await new Promise(r => setTimeout(r, 50)); const r3 = read()
      return { sync: r0, rAF1: r1, rAF2: r2, t50ms: r3 }
    })
    console.log('E (view-timeline) over time:', JSON.stringify(rLater))
  }
}, { html })
