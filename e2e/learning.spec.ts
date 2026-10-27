import { expect, test } from '@playwright/test'
import { CARDS, cardsOf, type Category } from '../src/cssnet/contract'
import { generateJourney } from '../src/app/replay'
import { VERB_WEIGHT } from '../src/model/config'
import { CALM, NORMAL, domOrder, engage, enter, openFresh, recordMetrics, resetMouse, stats } from './helpers'

test('mostly using two cards re-orders the whole category, live', async ({ page }) => {
  await openFresh(page); resetMouse()
  const trail: string[][] = []
  // A realistic Home session: mostly Saved Drafts and Team Updates, some Calendar.
  const seq = [
    ['drafts', 'open'], ['team', 'open'], ['drafts', 'share'], ['calendar', 'open'], ['team', 'open'],
    ['drafts', 'open'], ['team', 'favorite'], ['drafts', 'open'], ['team', 'open'], ['drafts', 'open'],
  ] as const
  for (const [card, verb] of seq) {
    await engage(page, card, verb, NORMAL)
    trail.push(await domOrder(page))
  }
  const final = await domOrder(page)
  expect(final.slice(0, 2), JSON.stringify(trail)).toEqual(['drafts', 'team'])
  // One Calendar press is not a clear lead over the untouched cards (margin ~1.7 presses at this
  // evidence, src/app/adaptive.ts), so the rest keep their default relative order.
  expect(final.slice(2)).toEqual(['briefing', 'calendar', 'inbox', 'notes'])
  // Live: the order changed during the session, not only on reload.
  expect(trail.some((o) => o.join() !== cardsOf('home').join())).toBe(true)
  // Untouched categories keep their default order.
  await enter(page, 'explore', NORMAL)
  expect(await domOrder(page)).toEqual(cardsOf('explore'))
  const s = await stats(page)
  recordMetrics('learning', { sequence: seq, orderAfterEachPress: trail, final, stats: s })
  expect(s.examples).toBe(seq.length)
})

test('order is applied on entry: train Explore, leave, come back', async ({ page }) => {
  await openFresh(page); resetMouse()
  await enter(page, 'explore', NORMAL)
  for (let k = 0; k < 4; k++) { await engage(page, 'tidepools', 'open', CALM); await engage(page, 'moss', 'open', NORMAL) }
  const explore = await domOrder(page)
  expect(new Set(explore.slice(0, 2))).toEqual(new Set(['tidepools', 'moss']))
  await enter(page, 'home', NORMAL)
  expect(await domOrder(page)).toEqual(cardsOf('home'))
  await enter(page, 'explore', NORMAL)
  expect(await domOrder(page)).toEqual(explore)
})

test('replay journey teaches clear per-category preferences', async ({ page }) => {
  await openFresh(page)
  await page.getByTestId('nav-model').click()
  await page.getByTestId('replay-journey').click()
  await expect(page.getByTestId('replay-journey')).toBeEnabled({ timeout: 60_000 })
  await page.evaluate(() => window.__smartweb.idle())
  const orders = await page.evaluate(() => window.__smartweb.orders())
  // Expected leaders come from the journey that was replayed (seed 42, 48 steps), by weighted
  // engagement; decay can reorder near-ties, so only clear leaders are asserted.
  const w: Record<string, number> = {}
  // The heart toggles: pressing it while on is an unfavorite, which teaches nothing.
  const fav: Record<string, boolean> = {}
  for (const s of generateJourney(42, 48)) {
    if (s.target.kind !== 'card') continue
    const { card } = s.target
    let verb = s.target.verb
    if (verb === 'favorite') { if (fav[card]) verb = 'unfavorite'; fav[card] = !fav[card] }
    w[card] = (w[card] ?? 0) + VERB_WEIGHT[verb]
  }
  const checks: Record<string, unknown> = {}
  for (const c of ['home', 'explore', 'library'] as Category[]) {
    const ranked = CARDS.filter((k) => k.category === c).map((k) => k.id).sort((a, b) => (w[b] ?? 0) - (w[a] ?? 0))
    const lead = (w[ranked[0]] ?? 0) - (w[ranked[1]] ?? 0)
    checks[c] = { expected: ranked.map((id) => `${id}:${w[id] ?? 0}`), got: orders[c] }
    if (lead >= 1.5) expect(orders[c][0], c).toBe(ranked[0])
    if ((w[ranked[1]] ?? 0) - (w[ranked[2]] ?? 0) >= 1.5) expect(new Set(orders[c].slice(0, 2)), c).toEqual(new Set(ranked.slice(0, 2)))
  }
  recordMetrics('replay', { orders, checks, stats: await stats(page) })
})
