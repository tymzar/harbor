// Network panel: true per-type cost by REMOVING elements (display:none still computes the element's own style).
import { withPage } from './r2-harness.mjs'
import path from 'node:path'
await withPage(async page => {
  await page.goto('file://' + path.resolve('research/experiments/r2-visual-demo.html'))
  await page.waitForTimeout(800)
  const res = await page.evaluate(() => {
    const { shape } = window.__r2
    const readOutputs = () => { const m = document.getElementById('net').computedStyleMap(); const r = []; for (let o = 0; o < 8; o++) r.push(m.get('--p' + o).value); return r }
    const net = document.getElementById('net'), panels = [...document.querySelectorAll('section.panel')]
    panels.forEach((p, j) => { if (j) p.remove() })
    const time = () => { const T = 100; const t0 = performance.now(); for (let t = 0; t < T; t++) { for (let i = 0; i < shape.inputs; i++) net.style.setProperty('--x' + i, (Math.random()).toFixed(5)); readOutputs() } return (performance.now() - t0) * 1000 / T }
    const out = { panel0_all: time() }
    const edges = [...document.querySelectorAll('.edge')], neurons = [...document.querySelectorAll('.neuron')]
    const viz = document.getElementById('netviz')
    edges.forEach(e => e.remove()); out.neuronsOnly = time()
    neurons.forEach(e => e.remove()); out.empty = time()
    neurons.forEach(e => viz.appendChild(e)); edges.forEach(e => viz.appendChild(e)); out.restored = time()
    neurons.forEach(e => e.remove()); out.edgesOnly = time()
    edges.slice(100).forEach(e => e.remove()); out.edges100 = time()
    out.perEdge = (out.edgesOnly - out.empty) / 208; out.perNeuron = (out.neuronsOnly - out.empty) / 40
    return out
  })
  console.log(JSON.stringify(res))
})
