// Supplementary check for the returning persona: does a quick close (Cmd-W right after a
// click) lose the last interactions? The worker saves to IndexedDB with a 1000 ms trailing
// debounce (src/model/config.ts SAVE_DEBOUNCE_MS) and nothing flushes on pagehide.
//   node reports/sessions/returning/quickclose.mjs
import { chromium } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.SMARTWEB_URL ?? 'http://127.0.0.1:5184/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ready = (page) => page.waitForFunction(() => {
  const b = document.querySelector('[data-testid=replay-journey]')
  return !!window.__smartweb && !!b && !b.disabled
}, null, { timeout: 30000 })
const examples = (page) => page.evaluate(() => window.__smartweb.stats().examples)

async function trial(closeAfterMs, clicks = 6, gapMs = 400) {
  const dir = mkdtempSync(join(tmpdir(), 'smartweb-qc-'))
  let ctx = await chromium.launchPersistentContext(dir, { headless: true, viewport: { width: 1280, height: 800 } })
  let page = ctx.pages()[0] ?? (await ctx.newPage())
  await page.goto(BASE); await ready(page)
  // wait well past the debounce so the starting point is saved
  await sleep(1500)
  const seq = ['nav-home', 'nav-explore', 'nav-library']
  for (let k = 0; k < clicks; k++) {
    const b = await page.getByTestId(`action-${seq[k % 3]}`).boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 })
    await sleep(120)
    await page.mouse.down(); await sleep(90); await page.mouse.up()
    await page.waitForFunction((n) => window.__smartweb.stats().examples >= n, k + 1)
    await sleep(k === clicks - 1 ? 0 : gapMs)
  }
  const atClose = await examples(page)
  await sleep(closeAfterMs)
  await ctx.close()
  ctx = await chromium.launchPersistentContext(dir, { headless: true, viewport: { width: 1280, height: 800 } })
  page = ctx.pages()[0] ?? (await ctx.newPage())
  await page.goto(BASE); await ready(page)
  const restored = await examples(page)
  await ctx.close()
  rmSync(dir, { recursive: true, force: true })
  return { closeAfterMs, gapMs, atClose, restored, lost: atClose - restored }
}

const results = []
for (const ms of [100, 400, 800, 1500, 3000]) {
  const r = await trial(ms)
  console.log(r)
  results.push(r)
}
// a fast burst (no pause >= 1 s between clicks), then close 100 ms after the last click
for (const gap of [0, 1500]) {
  const r = await trial(100, 6, gap)
  console.log(r)
  results.push(r)
}
writeFileSync(join(OUT, 'quickclose.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 1))
