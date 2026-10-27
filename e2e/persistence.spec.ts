import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { ActionId } from '../src/cssnet/contract'
import { NORMAL, humanClick, maxAbsDiff, openFresh, ready, recordMetrics, resetMouse, stats } from './helpers'

const PRIOR_RANKING = ['open-card', 'nav-home', 'nav-explore', 'nav-library', 'search', 'settings', 'favorite', 'share']
const JOURNEY: ActionId[] = ['nav-library', 'open-card', 'share', 'nav-library', 'open-card', 'share', 'nav-library', 'open-card', 'share', 'nav-library', 'open-card', 'share']
const flat = (w: { W1: number[]; b1: number[]; W2: number[]; b2: number[] } | null) => (w ? [...w.W1, ...w.b1, ...w.W2, ...w.b2] : [])
const snapshot = (page: import('@playwright/test').Page) => page.evaluate(() => ({
  stats: window.__smartweb.stats(), w: window.__smartweb.weights(), ranking: window.__smartweb.ranking(),
  markov: window.__smartweb.markov(), blended: window.__smartweb.blended(),
}))
/**
 * Pairs of actions the two rankings order differently, with the source's score gap.
 * The URL fragment is int8-quantised (lossy by design), so near-ties may swap.
 */
function inversions(src: { ranking: string[]; blended: number[] }, other: { ranking: string[] }) {
  const out: { a: string; b: string; gap: number }[] = []
  const idx = (r: string[], x: string) => r.indexOf(x)
  const ACT = ['nav-home', 'nav-explore', 'nav-library', 'search', 'open-card', 'favorite', 'share', 'settings']
  for (let i = 0; i < src.ranking.length; i++) for (let j = i + 1; j < src.ranking.length; j++) {
    const a = src.ranking[i], b = src.ranking[j]
    if (idx(other.ranking, a) > idx(other.ranking, b)) out.push({ a, b, gap: Math.abs(src.blended[ACT.indexOf(a)] - src.blended[ACT.indexOf(b)]) })
  }
  return out
}
const QUANT_TIE = 0.01
const SAVE_WAIT = 1500 // model saves are debounced by 1 s (SAVE_DEBOUNCE_MS)

test('reload restores stats and weights from IndexedDB; reset returns to the prior', async ({ page }) => {
  await openFresh(page); resetMouse()
  for (const a of JOURNEY) await humanClick(page, a, NORMAL)
  await page.waitForTimeout(SAVE_WAIT)
  const before = await snapshot(page)
  expect(before.stats.examples).toBe(JOURNEY.length)
  await page.reload(); await ready(page)
  const after = await snapshot(page)
  await expect(page.getByTestId('debug-toggle')).toBeVisible()
  expect(after.stats).toEqual(before.stats)
  expect(maxAbsDiff(flat(after.w), flat(before.w))).toBe(0)
  // Restored Markov state: after reload the last action (share) still predicts nav-library first.
  expect(after.ranking[0]).toBe('nav-library')

  await page.getByTestId('reset-model').click()
  await expect.poll(async () => (await stats(page)).examples).toBe(0)
  expect(await page.evaluate(() => window.__smartweb.ranking())).toEqual(PRIOR_RANKING)
  await page.waitForTimeout(SAVE_WAIT)
  await page.reload(); await ready(page)
  expect((await stats(page)).examples).toBe(0)
  expect(await page.evaluate(() => window.__smartweb.ranking())).toEqual(PRIOR_RANKING)
  recordMetrics('persistence_reload', { examplesBefore: before.stats.examples, examplesAfterReload: after.stats.examples, rankingAfterReload: after.ranking })
})

test('export: URL fragment and JSON file both import into a fresh browser context and reproduce the ranking', async ({ page, browser }) => {
  await openFresh(page); resetMouse()
  for (const a of JOURNEY) await humanClick(page, a, NORMAL)
  await page.waitForTimeout(SAVE_WAIT)
  // Reference: the source model as a fresh page load sees it (same idle input the importer will see).
  await page.reload(); await ready(page)
  const src = await snapshot(page)

  await page.getByTestId('debug-toggle').click()
  await page.getByTestId('export-link').click()
  const linkEl = page.getByTestId('debug-drawer').getByText(/^link: /)
  await expect(linkEl).toBeVisible()
  const link = (await linkEl.innerText()).replace(/^link: /, '').trim()
  expect(link).toMatch(/#m=[A-Za-z0-9_-]+$/)

  const downloadP = page.waitForEvent('download')
  await page.getByTestId('export-model').click()
  const file = await (await downloadP).path()
  const json = readFileSync(file, 'utf8')

  // 1) URL fragment into a brand-new context (empty IndexedDB).
  const ctxA = await browser.newContext(); const a = await ctxA.newPage()
  await a.goto(link); await ready(a)
  const viaLink = await snapshot(a)
  expect(new URL(a.url()).hash).toBe('') // fragment consumed and cleared
  expect(viaLink.stats.examples).toBe(src.stats.examples)
  expect(viaLink.ranking[0]).toBe(src.ranking[0])
  const linkInv = inversions(src, viaLink)
  for (const v of linkInv) expect(v.gap, `link swapped ${v.a}/${v.b}`).toBeLessThan(QUANT_TIE)
  const linkScoreErr = maxAbsDiff(viaLink.blended, src.blended)
  expect(linkScoreErr).toBeLessThan(0.02)
  const linkWeightErr = maxAbsDiff(flat(viaLink.w), flat(src.w))

  // 2) JSON file through the import-model control into another fresh context.
  const ctxB = await browser.newContext(); const b = await ctxB.newPage()
  await b.goto('/'); await ready(b)
  expect((await stats(b)).examples).toBe(0)
  const chooserP = b.waitForEvent('filechooser')
  await b.getByTestId('import-model').click()
  await (await chooserP).setFiles({ name: 'model.json', mimeType: 'application/json', buffer: Buffer.from(json) })
  await expect.poll(async () => (await stats(b)).examples).toBe(src.stats.examples)
  const viaJson = await snapshot(b)
  expect(viaJson.ranking).toEqual(src.ranking)
  expect(maxAbsDiff(flat(viaJson.w), flat(src.w))).toBe(0)

  recordMetrics('persistence_export', {
    fragmentChars: link.split('#m=')[1].length, jsonBytes: json.length,
    sourceRanking: src.ranking, linkRanking: viaLink.ranking, jsonRanking: viaJson.ranking,
    linkMaxWeightError: linkWeightErr, linkMaxScoreError: linkScoreErr, linkInversions: linkInv, linkRankingFullMatch: viaLink.ranking.join() === src.ranking.join(),
  })
  await ctxA.close(); await ctxB.close()
})
