import { expect, test } from '@playwright/test'
import type { CssNetMode } from '../src/cssnet/contract'
import { humanClick, openFresh, percentile, recordMetrics, resetMouse, type Intensity } from './helpers'

/**
 * Click-to-pixel, as the app measures it: from the pointerup that fires the action
 * (HeroUI onPress fires on release) to just after the first frame produced after React
 * committed the new order (rAF, then a posted message). That span covers feature
 * extraction, the worker round trip (train + predict), the CSS forward pass with readback,
 * React render, and the frame. latenciesDoubleRaf ends one frame later (upper bound).
 */
const QUICK: Intensity = { steps: 4, stepMs: 8, dwellMs: 30, pressMs: 60, gapMs: 150, wobble: 0 }
const JOURNEY = ['card-drafts-open', 'card-team-open', 'card-drafts-share', 'nav-explore', 'card-moss-open', 'card-tidepools-favorite', 'nav-home', 'card-calendar-open']
const N = 24
const results: Record<string, unknown> = {}

for (const mode of ['calc', 'hybrid', 'animation'] as CssNetMode[]) {
  test(`click-to-pixel p95 < 50 ms (${mode})`, async ({ page }) => {
    // Measured: under SwiftShader (software compositing) the PatternLayer's full-viewport
    // filter/blend layers cost ~100 ms per frame, p95 ~120 ms. Expected to fail there.
    test.fail(!!process.env.SMARTWEB_SOFTWARE_GL, 'SwiftShader: p95 ~120 ms, see playwright.config.ts')
    await openFresh(page); resetMouse()
    await page.getByTestId('mode-select').selectOption(mode)
    for (let k = 0; k < N; k++) await humanClick(page, JOURNEY[k % JOURNEY.length], QUICK)
    await expect.poll(async () => (await page.evaluate(() => window.__smartweb.latencies())).length).toBe(N)
    const lat = await page.evaluate(() => window.__smartweb.latencies())
    const dbl = await page.evaluate(() => window.__smartweb.latenciesDoubleRaf())
    const r = {
      n: lat.length, p50: percentile(lat, 50), p95: percentile(lat, 95), max: Math.max(...lat),
      doubleRaf: { p50: percentile(dbl, 50), p95: percentile(dbl, 95), max: Math.max(...dbl) },
      samples: lat.map((v) => +v.toFixed(2)),
    }
    results[mode] = r
    recordMetrics(process.env.SMARTWEB_SOFTWARE_GL ? 'latency_swiftshader' : 'latency', { definition: 'pointerup -> rAF+postMessage after the React commit of the new order', ...results })
    expect(r.p95, JSON.stringify(r)).toBeLessThan(50)
  })
}
