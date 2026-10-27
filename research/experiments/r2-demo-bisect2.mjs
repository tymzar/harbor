// Network panel: which part of the 248 elements costs? neurons vs edges vs will-change.
import { withPage } from './r2-harness.mjs'
import path from 'node:path'
await withPage(async page => {
  await page.goto('file://' + path.resolve('research/experiments/r2-visual-demo.html'))
  await page.waitForTimeout(800)
  const res = await page.evaluate(() => {
    const { shape, readOutputs } = window.__r2
    const net = document.getElementById('net'), panels = [...document.querySelectorAll('section.panel')]
    panels.forEach((p, j) => { if (j) p.style.display = 'none' })
    const time = () => { const T = 100; const t0 = performance.now(); for (let t = 0; t < T; t++) { for (let i = 0; i < shape.inputs; i++) net.style.setProperty('--x' + i, (Math.random()).toFixed(5)); readOutputs() } return (performance.now() - t0) * 1000 / T }
    const out = { panel0: time() }
    const edges = [...document.querySelectorAll('.edge')], neurons = [...document.querySelectorAll('.neuron')]
    edges.forEach(e => e.style.display = 'none'); out.neuronsOnly = time(); edges.forEach(e => e.style.display = '')
    neurons.forEach(e => e.style.display = 'none'); out.edgesOnly = time(); neurons.forEach(e => e.style.display = '')
    ;[...edges, ...neurons].forEach(e => e.style.willChange = 'auto'); out.noWillChange = time(); [...edges, ...neurons].forEach(e => e.style.willChange = '')
    // only the first 100 edges
    edges.slice(100).forEach(e => e.style.display = 'none'); neurons.forEach(e => e.style.display = 'none'); out.edges100only = time()
    return out
  })
  console.log(JSON.stringify(res))
})
