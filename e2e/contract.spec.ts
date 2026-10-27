import { expect, test } from '@playwright/test'
import { ALL_ACTIONS, openFresh } from './helpers'

test.beforeEach(async ({ page }) => { await openFresh(page) })

test('renders every data-testid from contract.ts, backed by the real CSS net', async ({ page }) => {
  for (const a of ALL_ACTIONS) await expect(page.getByTestId(`action-${a}`), `action-${a}`).toHaveCount(1)
  for (const id of ['suggestion-list', 'adaptive-grid', 'pattern-layer', 'network-view', 'debug-toggle',
    'reset-model', 'export-model', 'import-model', 'replay-journey', 'mode-select']) {
    await expect(page.getByTestId(id), id).toHaveCount(1)
  }
  const items = page.getByTestId('suggestion-item')
  expect(await items.count()).toBeGreaterThan(0)
  for (const a of await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-action')))) expect(ALL_ACTIONS).toContain(a)
  expect(await page.getByTestId('adaptive-grid').locator(':scope > *').count()).toBe(5)

  await expect(page.getByTestId('debug-drawer')).toHaveCount(0)
  await page.getByTestId('debug-toggle').click()
  await expect(page.getByTestId('debug-drawer')).toBeVisible()

  // Not the JS fallback: the net is mountCssNet's DOM, and the reference is cssnet/reference.
  expect(await page.evaluate(() => window.__smartweb.netSource())).toBe('cssnet')
  await expect(page.locator('[data-testid=cssnet-host] [data-cssnet=calc]')).toHaveCount(1)
  await expect(page.getByTestId('debug-drawer')).toContainText('net: cssnet (calc) · reference: cssnet/reference')
})
