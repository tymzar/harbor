import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { CATEGORIES, cardsOf, type CardId, type Verb } from '../src/cssnet/contract'
import { NORMAL, domOrder, engage, enter, maxAbsDiff, openFresh, ready, recordMetrics, resetMouse, stats } from './helpers'

const flat = (w: { W1: number[]; b1: number[]; W2: number[]; b2: number[] } | null) => (w ? [...w.W1, ...w.b1, ...w.W2, ...w.b2] : [])
const snapshot = (page: Page) => page.evaluate(() => ({ stats: window.__smartweb.stats(), w: window.__smartweb.weights(), orders: window.__smartweb.orders() }))
const SAVE_WAIT = 1500 // saves are debounced by 1 s

async function train(page: Page) {
  const home: [CardId, Verb][] = [['inbox', 'open'], ['notes', 'open'], ['inbox', 'share'], ['notes', 'open'], ['inbox', 'open'], ['calendar', 'open']]
  for (const [c, v] of home) await engage(page, c, v, NORMAL)
  await enter(page, 'library', NORMAL)
  for (const [c, v] of [['archive', 'open'], ['maps', 'open'], ['archive', 'favorite'], ['maps', 'open'], ['archive', 'open']] as [CardId, Verb][]) await engage(page, c, v, NORMAL)
  await enter(page, 'home', NORMAL)
}

test('the learned order is applied automatically on reload; reset returns to the default', async ({ page }) => {
  await openFresh(page); resetMouse()
  await train(page)
  await page.waitForTimeout(SAVE_WAIT)
  const before = await snapshot(page)
  expect(before.orders.home.slice(0, 2)).toEqual(['inbox', 'notes'])
  expect(before.orders.library.slice(0, 2)).toEqual(['archive', 'maps'])

  await page.reload(); await ready(page)
  // The grid comes up in the learned order without any interaction.
  expect(await domOrder(page)).toEqual(before.orders.home)
  const after = await snapshot(page)
  expect(after.stats.examples).toBe(before.stats.examples)
  expect(maxAbsDiff(flat(after.w), flat(before.w))).toBe(0)
  expect(after.orders).toEqual(before.orders)
  await enter(page, 'library', NORMAL)
  expect(await domOrder(page)).toEqual(before.orders.library)

  await page.getByTestId('nav-model').click()
  await page.getByTestId('reset-model').click()
  await expect.poll(async () => (await stats(page)).examples).toBe(0)
  await page.waitForTimeout(SAVE_WAIT)
  await page.reload(); await ready(page)
  // The app lands on the Home category page.
  await expect(page.getByTestId('adaptive-grid')).toBeVisible()
  expect(await domOrder(page)).toEqual(cardsOf('home'))
  expect(await page.evaluate(() => window.__smartweb.navOrder())).toEqual([...CATEGORIES])
  for (const c of CATEGORIES) expect((await snapshot(page)).orders[c]).toEqual(cardsOf(c))
  recordMetrics('persistence_reload', { ordersBefore: before.orders, ordersAfterReload: after.orders, examples: before.stats.examples })
})

test('leaving the page 150 ms after a press keeps that press', async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage()
  await openFresh(page); resetMouse()
  for (let k = 0; k < 3; k++) await engage(page, 'notes', k === 1 ? 'share' : 'open', NORMAL)
  const n = (await stats(page)).examples
  await page.waitForTimeout(150) // the old 1 s debounce lost presses here (persona test)
  await page.goto('about:blank')
  await page.goto('/'); await ready(page)
  expect((await stats(page)).examples).toBe(n)
  await ctx.close()
})

test('export: URL fragment and JSON file reproduce the orders in fresh browser contexts', async ({ page, browser }) => {
  await openFresh(page); resetMouse()
  await train(page)
  await page.waitForTimeout(SAVE_WAIT)
  const src = await snapshot(page)

  await page.getByTestId('nav-model').click()
  await page.getByTestId('debug-toggle').click()
  await page.getByTestId('export-link').click()
  const linkEl = page.getByTestId('debug-drawer').getByText(/^link: /)
  await expect(linkEl).toBeVisible()
  const link = (await linkEl.innerText()).replace(/^link: /, '').trim()
  expect(link).toMatch(/#m=[A-Za-z0-9_-]+$/)

  const downloadP = page.waitForEvent('download')
  await page.getByTestId('export-model').click()
  const json = readFileSync(await (await downloadP).path(), 'utf8')

  const ctxA = await browser.newContext(); const a = await ctxA.newPage()
  await a.goto(link); await ready(a)
  expect(new URL(a.url()).hash).toBe('')
  const viaLink = await snapshot(a)
  expect(viaLink.stats.examples).toBe(src.stats.examples)
  expect(viaLink.orders).toEqual(src.orders)
  expect(await domOrder(a)).toEqual(src.orders.home)

  const ctxB = await browser.newContext(); const b = await ctxB.newPage()
  await b.goto('/'); await ready(b)
  await b.getByTestId('nav-model').click()
  const chooserP = b.waitForEvent('filechooser')
  await b.getByTestId('import-model').click()
  await (await chooserP).setFiles({ name: 'model.json', mimeType: 'application/json', buffer: Buffer.from(json) })
  await expect.poll(async () => (await stats(b)).examples).toBe(src.stats.examples)
  const viaJson = await snapshot(b)
  expect(viaJson.orders).toEqual(src.orders)
  expect(maxAbsDiff(flat(viaJson.w), flat(src.w))).toBe(0)
  expect(await b.evaluate(() => window.__smartweb.navOrder())).toEqual(await page.evaluate(() => window.__smartweb.navOrder()))
  await b.getByTestId('nav-home').click()
  expect(await domOrder(b)).toEqual(src.orders.home)
  recordMetrics('persistence_export', { fragmentChars: link.split('#m=')[1].length, jsonBytes: json.length, orders: src.orders })
  await ctxA.close(); await ctxB.close()
})
