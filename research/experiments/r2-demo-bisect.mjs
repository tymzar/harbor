// Which demo panel makes the per-frame forward pass expensive? Hide panels one at a time and time mutate+read.
import { withPage } from './r2-harness.mjs'
import path from 'node:path'
await withPage(async page => {
  await page.goto('file://' + path.resolve('research/experiments/r2-visual-demo.html'))
  await page.waitForTimeout(800)
  const res = await page.evaluate(async () => {
    const { shape, x, readOutputs } = window.__r2
    const net = document.getElementById('net'), panels = [...document.querySelectorAll('section.panel')]
    const time = () => { const T = 100; const t0 = performance.now(); for (let t = 0; t < T; t++) { for (let i = 0; i < shape.inputs; i++) net.style.setProperty('--x' + i, (Math.random()).toFixed(5)); readOutputs() } return (performance.now() - t0) * 1000 / T }
    const out = { all: time() }
    for (let k = 0; k < panels.length; k++) { panels[k].style.display = 'none'; out['without_' + k] = time(); panels[k].style.display = '' }
    panels.forEach(p => p.style.display = 'none'); out.nothing = time(); panels.forEach(p => p.style.display = '')
    // only panel k visible
    for (let k = 0; k < panels.length; k++) { panels.forEach((p, j) => p.style.display = j === k ? '' : 'none'); out['only_' + k] = time() }
    panels.forEach(p => p.style.display = '')
    // remove the transition on the fingerprint
    document.querySelector('.fp.cpu').style.transition = 'none'; out.noTransition = time()
    out.counts = { edges: document.querySelectorAll('.edge').length, neurons: document.querySelectorAll('.neuron').length }
    return out
  })
  console.log(JSON.stringify(res, null, 1))
})
