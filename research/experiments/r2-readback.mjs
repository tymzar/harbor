// r2-readback: measure every way to read numbers back out of the CSS computation.
// Run: node research/experiments/r2-readback.mjs   (from the project root)
import { withPage } from './r2-harness.mjs'
import { makeWeights, netCss, jsForward, randomInput, inlineInputs, rand } from './r2-net.mjs'
import fs from 'node:fs'

const shape = { inputs: 16, hidden: 16, outputs: 8 }
const w = makeWeights(shape, 7)
const css = netCss(shape, w)
const r = rand(99)
const inputs = Array.from({ length: 60 }, () => Array.from(randomInput(shape, r)))
const refs = inputs.map(x => { const o = jsForward(shape, w, Float32Array.from(x)); return { hidden: Array.from(o.hidden), out: Array.from(o.out) } })

function pageHtml(heavy) {
  const O = shape.outputs, H = shape.hidden
  const rng = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('')
  return `<!doctype html><html><head><style>
${css}
body{margin:0}
.net{position:relative}
.w{height:1px}
${rng(O, o => `.w${o}{width:calc(var(--p${o})*10000px)}`)}
${rng(H, h => `.hw${h}{width:calc(var(--h${h})*10000px);height:1px}`)}
.sum{white-space:nowrap;width:1px;overflow:hidden;height:2px}
.sum span{display:inline-block;height:1px}
${rng(H, h => `.s${h}{width:calc(var(--h${h})*1000px)}`)}
.max{position:relative;width:1px;height:2px;overflow:hidden}
.max span{position:absolute;top:0;width:1px;height:1px}
${rng(H, h => `.m${h}{left:calc(var(--h${h})*1000px)}`)}
.arg{position:relative;width:20px;height:20px}
.arg div{position:absolute;inset:0}
${rng(O, o => `.a${o}{z-index:calc(var(--p${o})*1000000)}`)}
.anc{position:relative;height:3px}
${rng(O, o => `.an${o}{anchor-name:--an${o};position:absolute;top:0;height:1px;width:calc(var(--p${o})*10000px)}`)}
.anr{position:absolute;top:2px;height:1px;width:calc(anchor-size(--an0 width) + anchor-size(--an1 width) + anchor-size(--an2 width))}
.hsrc{anchor-name:--hsrc;position:absolute;left:0;top:0;height:1px;width:calc(200px + var(--h0)*300px)}
.heavy{position:absolute;left:0;top:30px;width:anchor-size(--hsrc width);height:200px;overflow:hidden;line-height:1px;font-size:1px}
.heavy i{display:inline-block;height:1px;width:3px}
.anim{width:1px;height:1px;animation:tl 1s linear paused;animation-delay:calc(var(--x0) * -1s)}
.anim2{width:1px;height:1px;animation:tl 1s linear(0, 0 50%, 1) paused;animation-delay:calc(var(--x0) * -1s)}
@keyframes tl{from{opacity:0.5}to{opacity:1}}
.scr{width:100px;height:10px;overflow-x:scroll;scroll-timeline:--st x}
.scr i{display:block;height:1px;width:calc(100px + var(--x1)*1000px)}
.scrAnim{width:1px;height:1px;animation:tl 1s linear;animation-timeline:--st}
</style></head><body>
<div class="net" id="net" style="${inlineInputs(inputs[0])}">
  <div id="probe"></div>
  ${rng(O, o => `<div class="w w${o}" id="w${o}"></div>`)}
  ${rng(H, h => `<div class="hw${h}" id="hw${h}"></div>`)}
  <div class="sum" id="sum">${rng(H, h => `<span class="s${h}"></span>`)}</div>
  <div class="max" id="max">${rng(H, h => `<span class="m${h}"></span>`)}</div>
  <div class="arg" id="arg">${rng(O, o => `<div class="a${o}" data-o="${o}"></div>`)}</div>
  <div class="anc">${rng(O, o => `<div class="an${o}"></div>`)}<div class="anr" id="anr"></div></div>
  <div class="anim" id="anim"></div><div class="anim2" id="anim2"></div>
  <div class="scr" id="scr"><i></i><div class="scrAnim" id="scrAnim"></div></div>
    ${heavy ? `<div class="hsrc"></div>` : ''}
</div>
${heavy ? `<div class="heavy">${'<i></i>'.repeat(6000)}</div>` : ''}
</body></html>`
}

const results = {}
await withPage(async page => {
  for (const heavy of [false, true]) {
    await page.setContent(pageHtml(heavy))
    await page.evaluate(() => document.body.offsetHeight)
    const out = await page.evaluate(async ({ inputs, refs, shape }) => {
      const O = shape.outputs, H = shape.hidden
      const net = document.getElementById('net')
      const setInput = (x) => { for (let i = 0; i < x.length; i++) net.style.setProperty(`--x${i}`, x[i]) }
      const probe = document.getElementById('probe')
      const wEls = Array.from({ length: O }, (_, o) => document.getElementById('w' + o))
      const hwEls = Array.from({ length: H }, (_, h) => document.getElementById('hw' + h))
      const median = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] }

      // channel readers: return array of O numbers (probabilities) where possible
      const channels = {
        gcs_var: () => { const cs = getComputedStyle(probe); const r = []; for (let o = 0; o < O; o++) r.push(parseFloat(cs.getPropertyValue('--p' + o))); return r },
        gcs_hidden16: () => { const cs = getComputedStyle(probe); const r = []; for (let h = 0; h < H; h++) r.push(parseFloat(cs.getPropertyValue('--h' + h))); return r },
        csmap_var: () => { const m = probe.computedStyleMap(); const r = []; for (let o = 0; o < O; o++) { const v = m.get('--p' + o); r.push(typeof v?.value === 'number' ? v.value : parseFloat(String(v))) } return r },
        gbcr_width: () => wEls.map(e => e.getBoundingClientRect().width / 10000),
        gbcr_hidden16: () => hwEls.map(e => e.getBoundingClientRect().width / 10000),
        offsetWidth: () => wEls.map(e => e.offsetWidth / 10000),
        scroll_sum: () => [document.getElementById('sum').scrollWidth / 1000],
        scroll_max: () => [(document.getElementById('max').scrollWidth - 1) / 1000],
        argmax_efp: () => { const a = document.getElementById('arg'); const b = a.getBoundingClientRect(); const e = document.elementFromPoint(b.left + 10, b.top + 10); return [Number(e?.dataset.o)] },
        anchor_sum3: () => [document.getElementById('anr').getBoundingClientRect().width / 10000],
        anim_progress: () => [document.getElementById('anim').getAnimations()[0].effect.getComputedTiming().progress],
      }
      const sizes = { gcs_var: O, gcs_hidden16: H, csmap_var: O, gbcr_width: O, gbcr_hidden16: H, offsetWidth: O, scroll_sum: 1, scroll_max: 1, argmax_efp: 1, anchor_sum3: 1, anim_progress: 1 }
      const res = {}
      for (const [name, read] of Object.entries(channels)) {
        let err = null, ok = true, note = ''
        try { read() } catch (e) { ok = false; note = e.message }
        if (!ok) { res[name] = { ok, note }; continue }
        // timing: mutate -> read ; also read-without-mutate
        const T = 300
        let a0 = performance.now()
        for (let t = 0; t < T; t++) { setInput(inputs[t % inputs.length]); read() }
        let a1 = performance.now()
        for (let t = 0; t < T; t++) read()
        let a2 = performance.now()
        for (let t = 0; t < T; t++) setInput(inputs[t % inputs.length])
        let a3 = performance.now()
        const tm = [(a1 - a0) * 1000 / T], tr = [(a2 - a1) * 1000 / T], tset = (a3 - a2) * 1000 / T
        // single-value read after mutate (to get marginal per-read cost)
        const one = { gcs_var: () => parseFloat(getComputedStyle(probe).getPropertyValue('--p0')), gbcr_width: () => wEls[0].getBoundingClientRect().width, csmap_var: () => probe.computedStyleMap().get('--p0').value, offsetWidth: () => wEls[0].offsetWidth }[name]
        let usOne = null
        if (one) { const b0 = performance.now(); for (let t = 0; t < T; t++) { setInput(inputs[t % inputs.length]); one() } usOne = (performance.now() - b0) * 1000 / T }
        // precision
        let maxErr = 0, sample = null
        for (let k = 0; k < inputs.length; k++) {
          setInput(inputs[k]); const v = read(); const ref = refs[k]
          let exp
          if (name === 'gcs_hidden16' || name === 'gbcr_hidden16') exp = ref.hidden
          else if (name === 'scroll_sum') exp = [ref.hidden.reduce((a, b) => a + b, 0)]
          else if (name === 'scroll_max') exp = [Math.max(...ref.hidden)]
          else if (name === 'argmax_efp') exp = [ref.out.indexOf(Math.max(...ref.out))]
          else if (name === 'anchor_sum3') exp = [ref.out[0] + ref.out[1] + ref.out[2]]
          else if (name === 'anim_progress') exp = [inputs[k][0]]
          else exp = ref.out
          for (let i = 0; i < exp.length; i++) maxErr = Math.max(maxErr, Math.abs(v[i] - exp[i]))
          if (k === 0) sample = { got: v.slice(0, 4), exp: exp.slice(0, 4) }
        }
        res[name] = { ok, n: sizes[name], usMutateRead: median(tm), usReadOnly: median(tr), usSetOnly: tset, usMutateRead1: usOne, maxErr, sample }
      }
      // raw serialization sample for precision notes
      setInput(inputs[0])
      res._gcsRaw = getComputedStyle(probe).getPropertyValue('--p0')
      res._csmapType = String(probe.computedStyleMap().get('--p0')?.constructor?.name)
      res._anim2 = { progress: document.getElementById('anim2').getAnimations()[0].effect.getComputedTiming().progress, x0: inputs[0][0], note: 'linear(0,0 50%,1) easing: if progress==x0 easing is NOT applied' }
      // scroll timeline readout
      const scr = document.getElementById('scr'); scr.scrollLeft = 500
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      const sa = document.getElementById('scrAnim').getAnimations()[0]
      res._scrollTimeline = { currentTime: String(sa?.currentTime?.value ?? sa?.currentTime), expectedPct: 500 / (inputs[0][1] * 1000) * 100, x1: inputs[0][1] }

      // ---- async channels ----
      // ResizeObserver on w0
      {
        const el = wEls[0]; const lat = []; let lastW = 0
        const ro = new ResizeObserver(entries => { lastW = entries[entries.length - 1].contentRect.width; ro._t1 = performance.now() })
        ro.observe(el)
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))
        let maxErr = 0
        for (let k = 1; k < 20; k++) {
          const t0 = performance.now(); setInput(inputs[k])
          await new Promise(r => { const chk = () => (ro._t1 > t0 ? r() : requestAnimationFrame(chk)); requestAnimationFrame(chk) })
          lat.push((ro._t1 - t0) * 1000); maxErr = Math.max(maxErr, Math.abs(lastW / 10000 - refs[k].out[0]))
        }
        ro.disconnect(); res.resizeObserver = { ok: true, n: 1, usLatency: median(lat), maxErr, note: 'async, fires in rendering steps (next frame)' }
      }
      // IntersectionObserver ratio: target width 1000px, left = (p-1)*1000px inside clipping root -> ratio = p
      {
        const root = document.createElement('div'); root.style.cssText = 'position:relative;width:1000px;height:4px;overflow:hidden'
        const tgt = document.createElement('div'); tgt.style.cssText = 'position:absolute;top:0;height:4px;width:1000px;left:calc((var(--p0) - 1)*1000px)'
        root.appendChild(tgt); net.appendChild(root)
        const thresholds = Array.from({ length: 1001 }, (_, i) => i / 1000)
        let last = null, t1 = 0
        const io = new IntersectionObserver(es => { last = es[es.length - 1].intersectionRatio; t1 = performance.now() }, { root, threshold: thresholds })
        io.observe(tgt)
        await new Promise(r => setTimeout(r, 50))
        const lat = []; let maxErr = 0, fired = 0
        for (let k = 1; k < 20; k++) {
          const t0 = performance.now(); setInput(inputs[k])
          await new Promise(r => setTimeout(r, 40))
          if (t1 > t0) { fired++; lat.push((t1 - t0) * 1000); maxErr = Math.max(maxErr, Math.abs(last - refs[k].out[0])) }
        }
        io.disconnect(); root.remove()
        res.intersectionObserver = { ok: true, n: 1, usLatency: median(lat), maxErr, fired, of: 19, note: 'async; only fires when a threshold is crossed (1001 thresholds used)' }
      }
      return res
    }, { inputs, refs, shape })
    results[heavy ? 'heavyDom' : 'lightDom'] = out
  }

  // ---- canvas / SVG foreignObject pixel readback ----
  const canvasRes = await page.evaluate(async ({ css, inputs, refs, O }) => {
    const esc = t => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const svg = (x) => `<svg xmlns="http://www.w3.org/2000/svg" width="${O * 4}" height="4"><foreignObject width="${O * 4}" height="4"><div xmlns="http://www.w3.org/1999/xhtml" class="net" style="display:flex;${x}"><style>${esc(css)} .c{width:4px;height:4px}${Array.from({ length: O }, (_, o) => `.c${o}{background:rgb(calc(var(--p${o})*255) 0 0)}`).join('')}</style>${Array.from({ length: O }, (_, o) => `<div class="c c${o}"></div>`).join('')}</div></foreignObject></svg>`
    const cv = document.createElement('canvas'); cv.width = O * 4; cv.height = 4
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    const lat = []; let maxErr = 0; let firstPx = null
    for (let k = 0; k < 10; k++) {
      const x = inputs[k].map((v, i) => `--x${i}:${v}`).join(';')
      const t0 = performance.now()
      const img = new Image()
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(x))
      await img.decode()
      ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, cv.width, 4).data
      const t1 = performance.now(); lat.push((t1 - t0) * 1000)
      const vals = Array.from({ length: O }, (_, o) => d[(o * 4 + 2) * 4] / 255)
      if (k === 0) firstPx = { got: vals.slice(0, 4), exp: refs[0].out.slice(0, 4) }
      for (let o = 0; o < O; o++) maxErr = Math.max(maxErr, Math.abs(vals[o] - refs[k].out[o]))
    }
    lat.sort((a, b) => a - b)
    return { ok: true, n: O, usLatency: lat[lat.length >> 1], maxErr, firstPx, note: 'data: URL SVG w/ foreignObject + inline @property/calc, drawImage, getImageData; 8-bit' }
  }, { css, inputs, refs, O: shape.outputs })
  results.lightDom.canvasForeignObject = canvasRes
})

fs.writeFileSync('research/experiments/out/r2-readback.json', JSON.stringify(results, null, 2))
for (const dom of ['lightDom', 'heavyDom']) {
  console.log(`\n== ${dom} ==`)
  for (const [k, v] of Object.entries(results[dom])) {
    if (k.startsWith('_')) { console.log(k, JSON.stringify(v)); continue }
    if (!v.ok) { console.log(k.padEnd(22), 'FAILED', v.note); continue }
    const us = v.usMutateRead ?? v.usLatency
    console.log(k.padEnd(22), `n=${String(v.n).padEnd(3)} mutate+readN=${us.toFixed(0).padStart(5)}us  mutate+read1=${(v.usMutateRead1 ?? NaN).toFixed(0).padStart(5)}us  setOnly=${(v.usSetOnly ?? NaN).toFixed(0).padStart(4)}us  readOnlyN=${(v.usReadOnly ?? NaN).toFixed(1).padStart(6)}us  maxErr=${v.maxErr.toExponential(2)}`, v.note ?? '', v.fired !== undefined ? `fired ${v.fired}/${v.of}` : '')
  }
}
