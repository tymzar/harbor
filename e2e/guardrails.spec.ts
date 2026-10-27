import { expect, test } from '@playwright/test'
import type { ActionId } from '../src/cssnet/contract'
import { NORMAL, atMostOneMoved, domGridOrder, humanClick, openFresh, recordMetrics, resetMouse } from './helpers'

test('realignment: nothing moves during cold start, then at most one grid element per interaction', async ({ page }) => {
  await openFresh(page); resetMouse()
  // A journey that strongly favours controls at the bottom of the grid, so it has a reason to move.
  const journey: ActionId[] = []
  for (let r = 0; r < 6; r++) journey.push('settings', 'share', 'search')
  const initial = await domGridOrder(page)
  const orders: string[][] = [initial]
  for (const a of journey) {
    await humanClick(page, a, NORMAL)
    await page.evaluate(() => window.__smartweb.idle())
    await page.waitForTimeout(50) // let React commit the new order
    orders.push(await domGridOrder(page))
  }
  const moves: number[] = orders.slice(1).map((o, i) => (o.join() === orders[i].join() ? 0 : 1))
  recordMetrics('guardrails', { journey, orders, movedPerInteraction: moves })
  for (let i = 1; i <= 3; i++) expect(orders[i], `cold start interaction ${i}`).toEqual(initial)
  for (let i = 1; i < orders.length; i++) expect(atMostOneMoved(orders[i - 1], orders[i]), `interaction ${i}: ${orders[i - 1]} -> ${orders[i]}`).toBe(true)
  expect(moves.reduce((a, b) => a + b, 0), 'the grid should realign at least once').toBeGreaterThan(0)
  // The hook agrees with the DOM.
  expect(await page.evaluate(() => window.__smartweb.gridOrder())).toEqual(orders.at(-1))
})
