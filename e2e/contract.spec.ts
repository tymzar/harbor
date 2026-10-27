import { expect, test } from '@playwright/test'
import { CATEGORIES, cardsOf } from '../src/cssnet/contract'
import { domOrder, openFresh } from './helpers'

test.beforeEach(async ({ page }) => { await openFresh(page) })

test('renders every data-testid from contract.ts, backed by the real CSS net', async ({ page }) => {
  for (const c of CATEGORIES) await expect(page.getByTestId(`nav-${c}`), `nav-${c}`).toHaveCount(1)
  for (const id of ['adaptive-grid', 'pattern-layer', 'network-view', 'cssnet-host', 'debug-toggle',
    'reset-model', 'export-model', 'export-link', 'import-model', 'replay-journey', 'mode-select']) {
    await expect(page.getByTestId(id), id).toHaveCount(1)
  }
  expect(await domOrder(page)).toEqual(cardsOf('home'))
  for (const card of cardsOf('home')) for (const v of ['open', 'favorite', 'share']) await expect(page.getByTestId(`card-${card}-${v}`)).toHaveCount(1)
  await expect(page.getByTestId('suggestion-list')).toHaveCount(0) // the side panel is gone
  await expect(page.getByTestId('debug-drawer')).toHaveCount(0)
  await page.getByTestId('debug-toggle').click()
  await expect(page.getByTestId('debug-drawer')).toBeVisible()
  await expect(page.locator('[data-testid=cssnet-host] [data-cssnet=calc]')).toHaveCount(3) // one net per category
  await expect(page.locator('[data-net-scope][data-active] [data-cssnet=calc]')).toHaveCount(1)
  await expect(page.getByTestId('debug-drawer')).toContainText('net: cssnet (calc) · reference: cssnet/reference')
})
