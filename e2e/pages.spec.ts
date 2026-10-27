import { expect, test } from '@playwright/test'
import { NORMAL, engage, openFresh, resetMouse } from './helpers'

test('overview, model tabs and engine benchmark render with real data', async ({ page }) => {
  await openFresh(page); resetMouse()
  for (const [c, v] of [['drafts', 'open'], ['team', 'open'], ['drafts', 'share'], ['team', 'open']] as const) await engage(page, c, v, NORMAL)

  await page.getByTestId('nav-overview').click()
  for (const t of ['Learned Orders', 'Live Signals', 'Ranking Quality', 'Usage by Category', 'CSS Engine', 'Recent Activity']) await expect(page.getByText(t, { exact: true })).toBeVisible()
  await expect(page.locator('.recharts-surface').first()).toBeVisible()
  await page.getByTestId('benchmark').click()
  await expect.poll(() => page.evaluate(() => window.__smartweb.benchmark()), { timeout: 30_000 }).not.toBeNull()
  const bench = await page.evaluate(() => window.__smartweb.benchmark())!
  expect(bench!.map((b) => b.mode)).toEqual(['calc', 'hybrid', 'animation'])
  for (const b of bench!) { expect(b.usPerEval).toBeGreaterThan(0); expect(b.maxDiff).toBeLessThan(1e-4) }

  await page.getByTestId('nav-model').click()
  await expect(page.getByTestId('network-view')).toBeInViewport()
  await page.getByTestId('tab-learning').click()
  await expect(page.getByText('Why This Order', { exact: true })).toHaveCount(3) // one per category
  await page.getByTestId('tab-engine').click()
  await expect(page.getByText('CSS Engine', { exact: true })).toBeVisible()
  await expect(page.getByTestId('network-view')).not.toBeInViewport() // kept mounted offscreen: the nets live there
})
