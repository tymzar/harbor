// r1-mlp-anim: full 15-16-8 MLP, BOTH layers in the animation engine, em bridge between them, calc() only for softmax division.
import { withPage } from './r1-harness.mjs'
import { genCss, genHtml, jsForward, randomWeights } from './r1-mlp-gen.mjs'

const shape = { inputs: 15, hidden: 16, outputs: 8 }
const w = randomWeights(shape)
const html = `<!doctype html><html><head><style>${genCss(shape, w)}</style></head><body>${genHtml(shape)}</body></html>`

await withPage(async page => {
  const r = await page.evaluate(({ inputs: I, hidden: H, outputs: O }) => {
    const root = document.querySelector('[data-role=root]'), out = document.querySelector('[data-role=out]')
    const hs = [...document.querySelectorAll('[data-role=h]')], pLast = document.querySelector(`[data-role=p][data-j="${H - 1}"]`)
    let s = 7; const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
    const trials = []
    for (let t = 0; t < 100; t++) {
      const x = Array.from({ length: I }, () => rand())
      for (let i = 0; i < I; i++) root.style.setProperty('--x' + i, String(x[i]))
      const cs = getComputedStyle(out)
      const probs = Array.from({ length: O }, (_, k) => parseFloat(cs.getPropertyValue('--p' + k)))
      const csp = getComputedStyle(pLast)
      const logits = Array.from({ length: O }, (_, k) => parseFloat(csp.getPropertyValue('--o' + k)))
      const hidden = hs.map(h => parseFloat(getComputedStyle(h).getPropertyValue('--h')))
      trials.push({ x, probs, logits, hidden })
    }
    // timing: set inputs + read 8 probs only
    const N = 500; const t0 = performance.now()
    for (let t = 0; t < N; t++) {
      for (let i = 0; i < I; i++) root.style.setProperty('--x' + i, String(rand()))
      const cs = getComputedStyle(out); let acc = 0
      for (let k = 0; k < O; k++) acc += parseFloat(cs.getPropertyValue('--p' + k))
    }
    const usPerEval = (performance.now() - t0) / N * 1000
    // timing: also reading hidden (16 more getComputedStyle)
    const t1 = performance.now()
    for (let t = 0; t < N; t++) {
      for (let i = 0; i < I; i++) root.style.setProperty('--x' + i, String(rand()))
      const cs = getComputedStyle(out); let acc = 0
      for (let k = 0; k < O; k++) acc += parseFloat(cs.getPropertyValue('--p' + k))
      for (const h of hs) acc += parseFloat(getComputedStyle(h).getPropertyValue('--h'))
    }
    const usPerEvalWithHidden = (performance.now() - t1) / N * 1000
    return { trials, usPerEval, usPerEvalWithHidden, anims: document.getAnimations().length, sampleOut: getComputedStyle(out).getPropertyValue('--p0') }
  }, shape)
  let eH = 0, eL = 0, eP = 0, agree = 0
  for (const t of r.trials) {
    const ref = jsForward(shape, w, t.x)
    for (let j = 0; j < shape.hidden; j++) eH = Math.max(eH, Math.abs(ref.hidden[j] - t.hidden[j]))
    for (let k = 0; k < shape.outputs; k++) { eL = Math.max(eL, Math.abs(ref.logits[k] - t.logits[k])); eP = Math.max(eP, Math.abs(ref.probs[k] - t.probs[k])) }
    const am = a => a.indexOf(Math.max(...a)); if (am(ref.probs) === am(t.probs)) agree++
  }
  const t0 = r.trials[0], ref0 = jsForward(shape, w, t0.x)
  console.log('sample CSS logits:', t0.logits.map(v => v.toFixed(4)).join(' '))
  console.log('sample JS  logits:', Array.from(ref0.logits, v => v.toFixed(4)).join(' '))
  console.log('sample CSS probs :', t0.probs.map(v => v.toFixed(4)).join(' '))
  console.log('sample JS  probs :', ref0.probs.map(v => v.toFixed(4)).join(' '))
  console.log(`15-16-8 all-animation MLP: animations=${r.anims}, maxAbsErr hidden=${eH.toExponential(2)} logits=${eL.toExponential(2)} probs=${eP.toExponential(2)}, argmax agreement ${agree}/${r.trials.length}`)
  console.log(`timing: ${r.usPerEval.toFixed(1)} us/eval (set 15 inputs + read 8 probs, synchronous, no rAF); ${r.usPerEvalWithHidden.toFixed(1)} us/eval incl. reading 16 hidden`)
}, { html })
