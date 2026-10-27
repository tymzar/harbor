// r2-flex-softmax: flex-grow = exp(z_i) -> child widths / container width == softmax(z)
// Run: node research/experiments/r2-flex-softmax.mjs
import { withPage } from './r2-harness.mjs'
import { rand } from './r2-net.mjs'
import fs from 'node:fs'

const O = 8
const r = rand(3)
const cases = []
for (let k = 0; k < 200; k++) {
  const range = k < 100 ? 4 : 20 // logits in [-range/2, range/2]
  cases.push(Array.from({ length: O }, () => (r() - 0.5) * range))
}
const softmax = z => { const m = Math.max(...z); const e = z.map(v => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s) }

const html = `<!doctype html><style>
${Array.from({ length: O }, (_, o) => `@property --z${o}{syntax:'<number>';inherits:true;initial-value:0}`).join('\n')}
body{margin:0}
.row{display:flex;width:1000px;height:10px}
.row div{flex:1 1 0px;min-width:0;height:10px}
${Array.from({ length: O }, (_, o) => `.row .c${o}{flex-grow:calc(exp(var(--z${o})))}`).join('\n')}
.row.big{width:10000px}
</style>
<div class="row" id="row">${Array.from({ length: O }, (_, o) => `<div class="c${o}"></div>`).join('')}</div>
<div class="row big" id="rowbig">${Array.from({ length: O }, (_, o) => `<div class="c${o}"></div>`).join('')}</div>`

const out = await withPage(async page => {
  await page.setContent(html)
  return page.evaluate(({ cases, O }) => {
    const res = { small: { maxErr: 0, argmaxOk: 0, n: 0 }, big: { maxErr: 0, argmaxOk: 0, n: 0 }, samples: [], us: 0, infCase: null }
    const rows = { small: document.getElementById('row'), big: document.getElementById('rowbig') }
    const softmax = z => { const m = Math.max(...z); const e = z.map(v => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s) }
    const t0 = performance.now()
    for (const [name, row] of Object.entries(rows)) {
      const W = name === 'small' ? 1000 : 10000
      for (let k = 0; k < cases.length; k++) {
        const z = cases[k]
        for (let o = 0; o < O; o++) row.style.setProperty('--z' + o, z[o])
        const kids = Array.from(row.children)
        const widths = kids.map(c => c.getBoundingClientRect().width)
        const p = widths.map(w => w / W)
        const ref = softmax(z)
        for (let o = 0; o < O; o++) res[name].maxErr = Math.max(res[name].maxErr, Math.abs(p[o] - ref[o]))
        const am = p.indexOf(Math.max(...p)), ar = ref.indexOf(Math.max(...ref))
        if (am === ar) res[name].argmaxOk++
        res[name].n++
        if (k === 0 && name === 'small') res.samples.push({ z: z.map(v => +v.toFixed(3)), p: p.map(v => +v.toFixed(5)), ref: ref.map(v => +v.toFixed(5)), sumP: p.reduce((a, b) => a + b, 0) })
      }
    }
    res.us = (performance.now() - t0) * 1000 / (cases.length * 2)
    // overflow check: logits around 90 (exp overflows float32 at ~88.7)
    const row = rows.small
    const z = [90, 89, 0, 0, 0, 0, 0, 0]
    for (let o = 0; o < O; o++) row.style.setProperty('--z' + o, z[o])
    const widths = Array.from(row.children).map(c => c.getBoundingClientRect().width)
    res.infCase = { z, widths, ref: softmax(z).map(v => +v.toFixed(4)) }
    return res
  }, { cases, O })
})
fs.writeFileSync('research/experiments/out/r2-flex-softmax.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 1))
