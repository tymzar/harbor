// r1-view-timeline-chain: two view-timeline hops. Does every hop cost one frame?
// L0: --h = 2x (time-based, paused). hop1: spacer1 width = h*S/2 -> subject1 view progress -> --y1 = progress (0..1).
// hop2: spacer2 width = y1*S -> subject2 view progress -> --y2.
import { withPage } from './r1-harness.mjs'
const S = 10000, W = 100
const prog = p => (S - p) / (S + W)
const css = `
@property --x { syntax: '<number>'; inherits: true; initial-value: 0; }
@property --h { syntax: '<number>'; inherits: true; initial-value: 0; }
@property --y1 { syntax: '<number>'; inherits: true; initial-value: 0; }
@property --y2 { syntax: '<number>'; inherits: true; initial-value: 0; }
@keyframes k-h { from { --h: 0 } to { --h: 2 } }
@keyframes k-y1 { from { --y1: 0 } to { --y1: 1 } }
@keyframes k-y2 { from { --y2: 0 } to { --y2: 1 } }
#root { timeline-scope: --s1, --s2; }
.l0 { animation: k-h 1s linear paused both; animation-delay: calc(var(--x) * -1s); }
.sc { width: ${S}px; height: 4px; overflow: hidden; display: flex; }
.sc > * { flex: none; height: 4px; }
.sp1 { width: calc(var(--h) * ${S/2}px); } .sb1 { width: ${W}px; view-timeline: --s1 inline; }
.l1 { animation: k-y1 linear both; animation-timeline: --s1; animation-range: cover; }
.sp2 { width: calc(var(--y1) * ${S}px); } .sb2 { width: ${W}px; view-timeline: --s2 inline; }
.l2 { animation: k-y2 linear both; animation-timeline: --s2; animation-range: cover; }
`
const html = `<!doctype html><html><head><style>${css}</style></head><body><div id="root"><div class="l0">
<div class="sc"><div class="sp1"></div><div class="sb1"></div></div>
<div class="l1"><div class="sc"><div class="sp2"></div><div class="sb2"></div></div><div class="l2"></div></div>
</div></div></body></html>`
await withPage(async page => {
  const r = await page.evaluate(async () => {
    const raf = () => new Promise(r => requestAnimationFrame(r))
    await raf(); await raf(); await raf()
    const root = document.getElementById('root'), l1 = document.querySelector('.l1'), l2 = document.querySelector('.l2')
    const read = () => ({ y1: parseFloat(getComputedStyle(l1).getPropertyValue('--y1')), y2: parseFloat(getComputedStyle(l2).getPropertyValue('--y2')) })
    const out = []
    for (const x of [0.3, 0.8]) {
      root.style.setProperty('--x', String(x))
      const seq = [read()]; for (let i = 0; i < 4; i++) { await raf(); seq.push(read()) }
      out.push({ x, seq })
    }
    return out
  })
  for (const o of r) {
    const y1 = prog(2 * o.x * S / 2), y2 = prog(y1 * S)
    console.log(`x=${o.x}: expect y1=${y1.toFixed(5)} y2=${y2.toFixed(5)}; immediate then after each rAF: ${o.seq.map(s => `(${s.y1.toFixed(5)},${s.y2.toFixed(5)})`).join(' ')}`)
  }
}, { html })
