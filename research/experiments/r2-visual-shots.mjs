// r2-visual-shots: open r2-visual-demo.html headless, verify parity + argmax flag, measure frame cost, screenshot panels.
import { withPage } from './r2-harness.mjs'
import path from 'node:path'
import fs from 'node:fs'
const file = 'file://' + path.resolve('research/experiments/r2-visual-demo.html')
await withPage(async page => {
  await page.goto(file)
  await page.waitForTimeout(1500)
  const stats = await page.evaluate(async () => {
    const { shape, x, readOutputs, readArgmaxFlags, jsForward } = window.__r2
    // parity + argmax flag over 100 random inputs (set directly, bypassing the rAF loop for a moment)
    let maxErr = 0, argOk = 0, flagOk = 0
    const net = document.getElementById('net')
    for (let k = 0; k < 100; k++) {
      for (let i = 0; i < shape.inputs; i++) { x[i] = Math.random() * 1.5; net.style.setProperty('--x' + i, x[i].toFixed(5)) }
      const css = readOutputs(), ref = jsForward(x), flags = readArgmaxFlags()
      for (let o = 0; o < shape.outputs; o++) maxErr = Math.max(maxErr, Math.abs(css[o] - ref.out[o]))
      const ar = Array.from(ref.out).indexOf(Math.max(...ref.out))
      if (flags.indexOf(1) === ar) argOk++
      if (flags.filter(v => v === 1).length === 1 && flags.every(v => v === 0 || v === 1)) flagOk++
    }
    // frame cost: rAF deltas over 60 frames
    const deltas = []; let last = performance.now()
    await new Promise(res => { let n = 0; const tick = now => { deltas.push(now - last); last = now; if (++n < 60) requestAnimationFrame(tick); else res() }; requestAnimationFrame(tick) })
    deltas.sort((a, b) => a - b)
    const hdr = ['s-fwd', 's-read', 's-err', 's-fps', 's-arg'].map(id => id + '=' + document.getElementById(id).textContent)
    return { maxErr, argOk, flagOk, medianFrameMs: deltas[30], p90FrameMs: deltas[54], header: hdr }
  })
  console.log(JSON.stringify(stats))
  fs.writeFileSync('research/experiments/out/r2-visual-stats.json', JSON.stringify(stats, null, 2))
  await page.screenshot({ path: 'research/screens/r2-visual-demo.png', fullPage: true })
  const panels = await page.$$('section.panel')
  const names = ['network', 'dotgrid', 'fingerprint', 'softmax']
  for (let i = 0; i < panels.length; i++) await panels[i].screenshot({ path: `research/screens/r2-${names[i]}.png` })
  // a second frame of the dot grid a bit later to show it warping
  await page.waitForTimeout(1200)
  await panels[1].screenshot({ path: 'research/screens/r2-dotgrid-2.png' })
}, { width: 1280, height: 1000 })
