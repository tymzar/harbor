import { expect, test } from '@playwright/test'
import { cardsOf } from '../src/cssnet/contract'
import { NORMAL, domOrder, engage, openFresh, recordMetrics, resetMouse } from './helpers'

test('evidence gate and hysteresis: no move on the first press, no flip-flop between equal favourites', async ({ page }) => {
  await openFresh(page); resetMouse()
  await engage(page, 'notes', 'open', NORMAL)
  expect(await domOrder(page), 'one press is not a preference yet').toEqual(cardsOf('home'))
  // Alternate two cards equally for a while: once they lead, they must not swap on every press.
  const orders: string[][] = []
  for (let k = 0; k < 12; k++) {
    await engage(page, k % 2 ? 'inbox' : 'notes', 'open', NORMAL)
    orders.push(await domOrder(page))
  }
  const tail = orders.slice(4)
  const flips = tail.slice(1).filter((o, i) => o.slice(0, 2).join() !== tail[i].slice(0, 2).join()).length
  recordMetrics('guardrails', { orders, flipsInTail: flips })
  for (const o of tail) expect(o.slice(0, 2).sort()).toEqual(['inbox', 'notes'])
  expect(flips, JSON.stringify(tail)).toBeLessThanOrEqual(2)
})
