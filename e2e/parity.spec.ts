import { expect, test } from '@playwright/test'
import { CARD_IDS, CARDS, type CssNetMode } from '../src/cssnet/contract'
import { CALM, NORMAL, RUSHED, engage, enter, maxAbsDiff, openFresh, recordMetrics, resetMouse } from './helpers'

/** calc < 1e-3 as specified; hybrid/animation documented ~5e-6, so 1e-4 is a 20x margin. */
const TOL: Record<CssNetMode, number> = { calc: 1e-3, hybrid: 1e-4, animation: 1e-4 }
const results: Record<string, unknown> = {}

for (const mode of ['calc', 'hybrid', 'animation'] as const) {
  test(`CSS forward pass (masked to the category) matches the JS reference in ${mode} mode`, async ({ page }) => {
    await openFresh(page); resetMouse()
    await page.getByTestId('mode-select').selectOption(mode)
    expect(await page.evaluate(() => window.__smartweb.netSource())).toBe('cssnet')
    await expect(page.locator(`[data-testid=cssnet-host] [data-cssnet=${mode}]`)).toHaveCount(3)
    const steps = [['drafts', 'open'], ['team', 'share'], ['nav', 'explore'], ['moss', 'open'], ['tidepools', 'favorite'], ['nav', 'library'], ['reading', 'open'], ['nav', 'home'], ['drafts', 'open']] as const
    const intens = [NORMAL, RUSHED, CALM]
    const diffs: number[] = []
    const outs: number[][] = []
    for (let k = 0; k < steps.length; k++) {
      const [a, b] = steps[k]
      if (a === 'nav') await enter(page, b, intens[k % 3]); else await engage(page, a, b, intens[k % 3])
      const { css, js, cat } = await page.evaluate(() => ({ css: window.__smartweb.cssOutputs(), js: window.__smartweb.jsOutputs(), cat: window.__smartweb.category() }))
      expect(css).toHaveLength(18)
      const inCat = CARD_IDS.map((_, i) => CARDS[i].category === cat)
      expect(css.filter((_, i) => inCat[i]).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 3)
      for (const [i, v] of css.entries()) if (!inCat[i]) expect(v).toBeLessThan(1e-9)
      diffs.push(maxAbsDiff(css, js))
      outs.push(css)
    }
    // Full model: after the idle refresh, every category's CSS outputs match the JS reference in that category's context.
    await expect.poll(async () => page.evaluate(() => {
      const a = window.__smartweb.cssAll(), b = window.__smartweb.jsAll()
      return Math.max(...a.map((v, i) => Math.abs(v - b[i])))
    }), { timeout: 3000 }).toBeLessThan(TOL[mode])
    const worst = Math.max(...diffs)
    const spread = Math.max(...outs.slice(1).map((o) => maxAbsDiff(o, outs[0])))
    results[mode] = { interactions: steps.length, maxAbsDiff: worst, perInteraction: diffs, tolerance: TOL[mode], outputSpread: spread }
    recordMetrics('parity', results)
    expect(spread).toBeGreaterThan(0.01)
    expect(worst).toBeLessThan(TOL[mode])
  })
}
