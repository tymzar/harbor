import { expect, test } from '@playwright/test'
import type { CssNetMode } from '../src/cssnet/contract'
import { NORMAL, RUSHED, CALM, humanClick, maxAbsDiff, openFresh, recordMetrics, resetMouse } from './helpers'

/**
 * Tolerances. calc: < 1e-3 as specified. hybrid/animation: MODE_NOTES in
 * src/cssnet/index.ts documents ~5e-6 precision (measured max |dp| 4.5e-6),
 * so 1e-4 leaves a 20x margin while still catching a real divergence.
 */
const TOL: Record<CssNetMode, number> = { calc: 1e-3, hybrid: 1e-4, animation: 1e-4 }
const results: Record<string, unknown> = {}

for (const mode of ['calc', 'hybrid', 'animation'] as const) {
  test(`CSS forward pass matches the JS reference in ${mode} mode`, async ({ page }) => {
    await openFresh(page); resetMouse()
    await page.getByTestId('mode-select').selectOption(mode)
    expect((await page.evaluate(() => window.__smartweb.stats())).mode).toBe(mode)
    expect(await page.evaluate(() => window.__smartweb.netSource())).toBe('cssnet')
    await expect(page.locator(`[data-testid=cssnet-host] [data-cssnet=${mode}]`)).toHaveCount(1)

    const journey = ['nav-explore', 'open-card', 'favorite', 'share', 'nav-library', 'open-card', 'settings', 'nav-home', 'favorite', 'search'] as const
    const intens = [NORMAL, RUSHED, CALM]
    const diffs: number[] = []
    const outs: number[][] = []
    for (let k = 0; k < journey.length; k++) {
      await humanClick(page, journey[k], intens[k % 3])
      await page.evaluate(() => window.__smartweb.idle())
      const { css, js } = await page.evaluate(() => ({ css: window.__smartweb.cssOutputs(), js: window.__smartweb.jsOutputs() }))
      expect(css).toHaveLength(8)
      expect(css.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3)
      diffs.push(maxAbsDiff(css, js))
      outs.push(css)
    }
    const worst = Math.max(...diffs)
    // The outputs must actually move with training/input (a frozen net would trivially "match").
    const spread = Math.max(...outs.slice(1).map((o) => maxAbsDiff(o, outs[0])))
    results[mode] = { interactions: journey.length, maxAbsDiff: worst, perInteraction: diffs, tolerance: TOL[mode], outputSpread: spread }
    recordMetrics('parity', results)
    expect(spread).toBeGreaterThan(0.01)
    expect(worst).toBeLessThan(TOL[mode])
  })
}
