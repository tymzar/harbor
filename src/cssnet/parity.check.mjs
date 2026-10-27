// Parity + timing check for the CSS compute engine. Run from the project root:
//   node src/cssnet/parity.check.mjs [--trials 200] [--shape 15,16,8] [--json out.json]
// Bundles src/cssnet/index.ts in memory with Vite (IIFE global `CssNet`), injects it into a
// blank page in headless Chromium and, for each mode, compares readOutputs()/readHidden()
// against jsForward on random inputs/weights, then times set+read loops.
import { chromium } from '@playwright/test'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def }
const TRIALS = Number(opt('trials', 200))
const [I, H, O] = String(opt('shape', '15,16,8')).split(',').map(Number)
const shape = { inputs: I, hidden: H, outputs: O }
const jsonOut = opt('json', null)

async function bundle() {
  const out = await build({
    configFile: false, logLevel: 'silent', root,
    build: { write: false, minify: false, target: 'es2022', lib: { entry: path.join(here, 'index.ts'), formats: ['iife'], name: 'CssNet', fileName: 'cssnet' } },
  })
  const o = Array.isArray(out) ? out[0] : out
  return o.output.find((c) => c.type === 'chunk').code
}

const code = await bundle()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text()) })
await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="host"></div></body></html>')
await page.addScriptTag({ content: code })
const ver = await browser.version()

const results = {}
const variants = [['calc', {}], ['hybrid', {}], ['animation', {}], ['calc', { literalWeights: true }], ['hybrid', { literalWeights: false }], ['animation', { literalWeights: false }]]
for (const [mode, opts] of variants) {
  const label = 'literalWeights' in opts ? `${mode}/${opts.literalWeights ? 'literal' : 'property'}-weights` : mode
  const r = await page.evaluate(async ({ shape, mode, TRIALS, opts }) => {
    const { mountCssNet, jsForward, randomWeights, mulberry32 } = window.CssNet
    const host = document.getElementById('host')
    host.textContent = ''
    const t0m = performance.now()
    const net = mountCssNet(host, shape, mode, opts)
    const mountMs = performance.now() - t0m
    const rnd = mulberry32(1234 + shape.inputs)
    // inputs shaped like the app: 7 z-scores in [-4, 4] then one-hot-ish {0,1}
    const randomInput = () => Float32Array.from({ length: shape.inputs }, (_, i) => (i < 7 ? (rnd() * 2 - 1) * 4 : rnd() < 0.125 ? 1 : 0))
    let maxP = 0, maxH = 0, agree = 0, worst = null, hMaxSeen = 0
    const perWeightSet = 10
    let w = null
    for (let t = 0; t < TRIALS; t++) {
      if (t % perWeightSet === 0) { w = randomWeights(shape, 100 + t); net.setWeights(w) }
      const x = randomInput()
      net.setInputs(x)
      const p = net.readOutputs(), h = net.readHidden()
      const ref = jsForward(shape, w, x)
      let eP = 0, eH = 0
      for (let k = 0; k < shape.outputs; k++) eP = Math.max(eP, Math.abs(p[k] - ref.out[k]))
      for (let j = 0; j < shape.hidden; j++) { eH = Math.max(eH, Math.abs(h[j] - ref.hidden[j])); hMaxSeen = Math.max(hMaxSeen, ref.hidden[j]) }
      const am = (a) => { let b = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[b]) b = i; return b }
      if (am(p) === am(ref.out)) agree++
      if (eP > maxP) worst = { t, css: Array.from(p), js: Array.from(ref.out) }
      maxP = Math.max(maxP, eP); maxH = Math.max(maxH, eH)
    }
    // timing: loop averages (headless performance.now is 100us-quantised)
    const N = 200
    const xs = Array.from({ length: N }, randomInput)
    const run = (fn) => { const t0 = performance.now(); for (let i = 0; i < N; i++) fn(i); return (performance.now() - t0) / N * 1000 }
    run((i) => { net.setInputs(xs[i]); net.readOutputs() }) // warm-up
    const evalUs = run((i) => { net.setInputs(xs[i]); net.readOutputs() })
    const evalHiddenUs = run((i) => { net.setInputs(xs[i]); net.readOutputs(); net.readHidden() })
    const readOnlyUs = run(() => { net.readOutputs() })
    const ws = Array.from({ length: 20 }, (_, i) => randomWeights(shape, 500 + i))
    const weightsUs = run((i) => { net.setWeights(ws[i % 20]); net.readOutputs() })
    const anims = document.getAnimations().length
    const sample = { x: Array.from(xs[0]), css: Array.from((net.setInputs(xs[0]), net.readOutputs())), js: Array.from(jsForward(shape, ws[19], xs[0]).out) }
    net.destroy()
    return { mode, maxAbsDiffProbs: maxP, maxAbsDiffHidden: maxH, argmaxAgree: agree, trials: TRIALS, hiddenMaxSeen: hMaxSeen, evalUs, evalHiddenUs, readOnlyUs, weightsUs, mountMs, anims, worst, sample, typedOM: typeof Element.prototype.computedStyleMap === 'function' }
  }, { shape, mode, TRIALS, opts })
  results[label] = r
  console.log(`[${label}] trials=${r.trials} maxAbsDiff probs=${r.maxAbsDiffProbs.toExponential(2)} hidden=${r.maxAbsDiffHidden.toExponential(2)} argmax ${r.argmaxAgree}/${r.trials} (max hidden seen ${r.hiddenMaxSeen.toFixed(2)})`)
  console.log(`[${label}] timing: ${r.evalUs.toFixed(0)} us/eval (setInputs + readOutputs), ${r.evalHiddenUs.toFixed(0)} us incl. readHidden, ${r.readOnlyUs.toFixed(1)} us read-only, ${r.weightsUs.toFixed(0)} us setWeights+read, mount ${r.mountMs.toFixed(1)} ms, ${r.anims} animations, typedOM=${r.typedOM}`)
  console.log(`[${label}] sample css ${r.sample.css.map((v) => v.toFixed(4)).join(' ')}\n[${label}] sample js  ${r.sample.js.map((v) => v.toFixed(4)).join(' ')}`)
}
await browser.close()
console.log(`Chromium ${ver}; shape ${I}-${H}-${O}`)
const ok = results.calc.maxAbsDiffProbs < 1e-3
console.log(ok ? 'PASS: calc max abs diff < 1e-3' : 'FAIL: calc max abs diff >= 1e-3')
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ chromium: ver, shape, results }, null, 2))
process.exit(ok ? 0 : 1)
