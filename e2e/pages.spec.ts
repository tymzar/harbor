import { expect, test } from '@playwright/test'
import { NORMAL, engage, openFresh, resetMouse } from './helpers'

test('today page, model tabs and engine benchmark render with real data', async ({ page }) => {
  await openFresh(page); resetMouse()
  for (const [c, v] of [['drafts', 'open'], ['team', 'open'], ['drafts', 'share'], ['team', 'open']] as const) await engage(page, c, v, NORMAL)

  await page.getByTestId('nav-overview').click()
  for (const t of ['Jump Back In', 'Up Next', 'Recently Used', 'Favorites', 'Your Spaces']) await expect(page.getByText(t, { exact: true })).toBeVisible()
  // The product pages carry no model internals; those live on the Model page.
  for (const t of ['Learned Orders', 'Live Signals', 'Ranking Quality', 'CSS Engine']) await expect(page.getByText(t, { exact: true })).toHaveCount(0)
  // Jump Back In leads with the learned order: Home's top card first (drafts after 3 presses), and opening it counts.
  const before = (await page.evaluate(() => window.__smartweb.stats())).examples
  await page.getByRole('region', { name: 'Jump back in' }).getByRole('button').first().click()
  await expect(page.getByTestId('adaptive-grid')).toBeVisible()
  await expect.poll(async () => (await page.evaluate(() => window.__smartweb.stats())).examples).toBeGreaterThan(before)

  await page.getByTestId('nav-model').click()
  await page.getByTestId('tab-learning').click()
  for (const t of ['Learned Orders', 'Live Signals', 'Ranking Quality', 'Usage by Category', 'Recent Activity']) await expect(page.getByText(t, { exact: true })).toBeVisible()
  await expect(page.locator('.recharts-surface').first()).toBeVisible()
  await page.getByTestId('tab-engine').click()
  await page.getByTestId('benchmark').click()
  await expect.poll(() => page.evaluate(() => window.__smartweb.benchmark()), { timeout: 30_000 }).not.toBeNull()
  const bench = await page.evaluate(() => window.__smartweb.benchmark())!
  expect(bench!.map((b) => b.mode)).toEqual(['calc', 'hybrid', 'animation'])
  for (const b of bench!) { expect(b.usPerEval).toBeGreaterThan(0); expect(b.maxDiff).toBeLessThan(1e-4) }

  await page.getByTestId('tab-network').click()
  await expect(page.getByTestId('network-view')).toBeInViewport()
  await page.getByTestId('tab-learning').click()
  await expect(page.getByText('Why This Order', { exact: true })).toHaveCount(3) // one per category
  await page.getByTestId('tab-engine').click()
  await expect(page.getByText('CSS Engine', { exact: true })).toBeVisible()
  await expect(page.getByTestId('network-view')).not.toBeInViewport() // kept mounted offscreen: the nets live there
})
