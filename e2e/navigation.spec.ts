import { expect, test, type Page } from '@playwright/test'
import { CATEGORIES, type CardId, type Category } from '../src/cssnet/contract'
import { NORMAL, engage, enter, moveAway, openFresh, ready, recordMetrics, resetMouse, stats } from './helpers'

const SAVE_WAIT = 1500 // saves are debounced by 1 s

/** Category order as rendered in the sidebar (DOM order). */
const sidebarOrder = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-testid=nav-categories] [data-nav]')].map((e) => e.getAttribute('data-nav')!))
const navOrder = (page: Page) => page.evaluate(() => window.__smartweb.navOrder())

/** Sidebar DOM order and the controller's navOrder agree; returns the order. */
async function order(page: Page): Promise<Category[]> {
  const nav = await navOrder(page)
  await moveAway(page) // the sidebar holds its order while the pointer is over it
  await expect.poll(() => sidebarOrder(page)).toEqual(nav)
  return nav
}

test('using Library moves it above Home; the order survives a reload; reset restores the default', async ({ page }) => {
  await openFresh(page); resetMouse()
  expect(await order(page)).toEqual([...CATEGORIES])
  expect([...CATEGORIES]).toEqual(['home', 'explore', 'library'])

  // A person who keeps going to Library and working there, popping back Home in between.
  const work: [CardId, 'open' | 'favorite'][] = [['archive', 'open'], ['maps', 'open'], ['reading', 'favorite']]
  const trail: Category[][] = []
  for (let round = 0; round < 4; round++) {
    await enter(page, 'library', NORMAL)
    await page.evaluate(() => scrollTo(0, 0))
    for (const [c, v] of work) await engage(page, c, v, NORMAL)
    await enter(page, 'home', NORMAL)
    trail.push(await order(page))
  }
  const learned = await order(page)
  expect(learned.indexOf('library'), JSON.stringify(trail)).toBeLessThan(learned.indexOf('home'))
  expect(learned[0]).toBe('library')

  await page.waitForTimeout(SAVE_WAIT)
  await page.reload(); await ready(page)
  expect(await order(page), 'learned sidebar order restored on reload').toEqual(learned)

  await page.getByTestId('nav-model').click()
  await page.getByTestId('reset-model').click()
  await expect.poll(async () => (await stats(page)).examples).toBe(0)
  expect(await order(page)).toEqual(['home', 'explore', 'library'])
  await page.waitForTimeout(SAVE_WAIT)
  await page.reload(); await ready(page)
  expect(await order(page), 'reset order persisted').toEqual(['home', 'explore', 'library'])
  recordMetrics('navigation', { trail, learned })
})

test('hysteresis: alternating equally between two categories does not flip the sidebar on every visit', async ({ page }) => {
  await openFresh(page); resetMouse()
  const seq: Category[][] = []
  for (let k = 0; k < 10; k++) {
    await enter(page, k % 2 ? 'home' : 'explore', NORMAL)
    seq.push(await order(page))
  }
  const rel = seq.map((o) => (o.indexOf('home') < o.indexOf('explore') ? 'home' : 'explore'))
  const flips = rel.reduce((n, r, i) => n + (i > 0 && r !== rel[i - 1] ? 1 : 0), 0)
  recordMetrics('navigation_hysteresis', { seq, flips })
  // Without hysteresis the most recently visited of two near-equal categories would lead after
  // every visit (9 flips); with it the pair settles and stays.
  expect(flips, JSON.stringify(seq)).toBeLessThanOrEqual(1)
  // The untouched category never overtakes the two in use.
  for (const o of seq.slice(4)) expect(o[2], JSON.stringify(seq)).toBe('library')
})
