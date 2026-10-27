// r2-visual-cost: how does the forward pass (style recalc) scale with visual consumer elements?
import { withPage } from './r2-harness.mjs'
import { makeWeights, netCss, randomInput, inlineInputs, rand } from './r2-net.mjs'
const shape = { inputs: 16, hidden: 16, outputs: 8 }
const w = makeWeights(shape, 7), css = netCss(shape, w), r = rand(5)
const inputs = Array.from({ length: 50 }, () => Array.from(randomInput(shape, r)))
const html = (K, kind) => `<!doctype html><style>${css}
.c{width:4px;height:4px;display:inline-block}
.c.op{opacity:calc(0.2 + var(--h0)*0.5)}
.c.tr{will-change:transform;transform:scale(calc(0.5 + var(--h1)*0.4))}
.c.gl{will-change:transform,opacity,filter;transform:scale(calc(0.5 + var(--h1)*0.4));opacity:calc(0.2 + var(--h0)*0.5);filter:hue-rotate(calc(var(--h2)*90deg))}
.c.wd{width:calc(2px + var(--h0)*3px)}
</style><div class="net" id="net" style="${inlineInputs(inputs[0])}"><div id="probe"></div><div id="vis">${`<i class="c ${kind}"></i>`.repeat(K)}</div></div>
<div id="outside">${kind === 'outside' ? '<i class="c"></i>'.repeat(K) : ''}</div>`
await withPage(async page => {
  console.log('K'.padEnd(6), 'kind'.padEnd(10), 'mutate+gcs(us)')
  for (const kind of ['none', 'op', 'tr', 'gl', 'wd', 'outside']) for (const K of [0, 100, 500, 2000]) {
    if (K === 0 && kind !== 'none') continue
    await page.setContent(html(kind === 'outside' ? 0 : K, kind))
    const us = await page.evaluate(({ inputs, T }) => {
      const net = document.getElementById('net'), probe = document.getElementById('probe')
      const read = () => parseFloat(getComputedStyle(probe).getPropertyValue('--p0'))
      read()
      const t0 = performance.now()
      for (let t = 0; t < T; t++) { const x = inputs[t % inputs.length]; for (let i = 0; i < 16; i++) net.style.setProperty('--x' + i, x[i]); read() }
      return (performance.now() - t0) * 1000 / T
    }, { inputs, T: 200 })
    console.log(String(K).padEnd(6), kind.padEnd(10), us.toFixed(0))
  }
})
