// r2-visual-cost2: why are demo edges ~6us each? Isolate inline-style alias vs inline static decls vs class-only.
import { withPage } from './r2-harness.mjs'
import { makeWeights, netCss, randomInput, inlineInputs, rand } from './r2-net.mjs'
const shape = { inputs: 16, hidden: 16, outputs: 8 }
const w = makeWeights(shape, 7), css = netCss(shape, w), r = rand(5)
const inputs = Array.from({ length: 50 }, () => Array.from(randomInput(shape, r)))
const K = 250
const variants = {
  classOnly: () => `<i class="c"></i>`,
  classOnly_willchange: () => `<i class="c wc"></i>`,
  inlineAlias: (k) => `<i class="c al" style="--a-src:var(--h${k % 16})"></i>`,
  inlineAlias_registered: (k) => `<i class="c al" style="--a-reg:var(--h${k % 16})"></i>`,
  inlineStatic6: (k) => `<i class="c" style="left:${k}px;top:${k}px;width:${k}px;transform:rotate(${k}rad);--wabs:0.5;height:2px"></i>`,
  demoEdge: (k) => `<i class="c al wc" style="left:${k}px;top:${k}px;width:${k}px;transform:rotate(${k}rad);--wabs:0.5;--a-src:var(--h${k % 16});height:2px"></i>`,
  demoEdge_noWC: (k) => `<i class="c al" style="left:${k}px;top:${k}px;width:${k}px;transform:rotate(${k}rad);--wabs:0.5;--a-src:var(--h${k % 16});height:2px"></i>`,
  demoEdge_classGeom: (k) => `<i class="c al wc g${k % 16}" style="--a-src:var(--h${k % 16})"></i>`,
  demoEdge_colormix: (k) => `<i class="c al wc cm" style="left:${k}px;top:${k}px;width:${k}px;transform:rotate(${k}rad);--wabs:0.5;--a-src:var(--h${k % 16});height:2px"></i>`,
  neuron_shadow_filter: (k) => `<i class="c nr" style="left:${k}px;top:${k}px;--a:var(--h${k % 16})"></i>`,
  neuron_noShadow: (k) => `<i class="c nr nosh" style="left:${k}px;top:${k}px;--a:var(--h${k % 16})"></i>`,
  neuron_noFilter: (k) => `<i class="c nr nofi" style="left:${k}px;top:${k}px;--a:var(--h${k % 16})"></i>`,
}
const html = (gen) => `<!doctype html><style>${css}
@property --a-reg{syntax:'<number>';inherits:false;initial-value:0}
.c{position:absolute;width:4px;height:4px;opacity:calc(0.2 + var(--h0)*0.5);background:linear-gradient(90deg,#0ff,#f0f)}
.wc{will-change:opacity}
.al{opacity:clamp(0, var(--a-src, var(--a-reg)) * var(--wabs, 0.5) * 1.4, 1)}

.cm{--ec:#0ff;background:linear-gradient(90deg, var(--ec) 0%, color-mix(in oklab, var(--ec), white 35%) 100%)}
.nr{--c:#0ff;background:var(--c);box-shadow:0 0 10px 1px var(--c);will-change:transform,opacity,filter;transform:scale(calc(0.45 + clamp(0, var(--a), 1.6) * 0.6));opacity:calc(0.25 + clamp(0, var(--a), 1) * 0.75);filter:hue-rotate(calc(clamp(0, var(--a), 1.6) * -40deg))}
.nosh{box-shadow:none}.nofi{filter:none}
${Array.from({ length: 16 }, (_, k) => `.g${k}{left:${k * 10}px;top:${k}px;width:${k * 30}px;transform:rotate(${k / 10}rad);--wabs:0.5;height:2px}`).join('')}
</style><div class="net" id="net" style="${inlineInputs(inputs[0])}"><div id="probe"></div><div id="vis" style="position:relative;height:300px">${Array.from({ length: K }, (_, k) => gen(k)).join('')}</div></div>`
await withPage(async page => {
  console.log('variant'.padEnd(26), `mutate+gcs(us) for K=${K}`, '  per-element(us)')
  for (const [name, gen] of Object.entries(variants)) {
    await page.setContent(html(gen))
    const us = await page.evaluate(({ inputs, T }) => {
      const net = document.getElementById('net'), probe = document.getElementById('probe')
      const read = () => parseFloat(getComputedStyle(probe).getPropertyValue('--p0'))
      read()
      const t0 = performance.now()
      for (let t = 0; t < T; t++) { const x = inputs[t % inputs.length]; for (let i = 0; i < 16; i++) net.style.setProperty('--x' + i, x[i]); read() }
      return (performance.now() - t0) * 1000 / T
    }, { inputs, T: 200 })
    console.log(name.padEnd(26), us.toFixed(0).padStart(6), ((us - 213) / K).toFixed(2).padStart(18))
  }
})
