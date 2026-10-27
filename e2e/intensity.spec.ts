import { expect, test, type Browser } from '@playwright/test'
import { ACTIONS, type ActionId } from '../src/cssnet/contract'
import { CALM, RUSHED, humanClick, l1, openFresh, recordMetrics, resetMouse, type Intensity } from './helpers'

const JOURNEY: ActionId[] = ['nav-home', 'nav-explore', 'open-card', 'favorite']
const REPS = 6

/** Run the journey with one intensity profile in a fresh browser context (own IndexedDB). */
async function trainedOutputs(browser: Browser, it: Intensity) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await openFresh(page); resetMouse()
  for (let r = 0; r < REPS; r++) for (const a of JOURNEY) await humanClick(page, a, it)
  await page.evaluate(() => window.__smartweb.idle())
  const out = await page.evaluate(() => ({
    mlp: window.__smartweb.cssOutputs(), x: window.__smartweb.features(), w: window.__smartweb.weights()!, stats: window.__smartweb.stats(),
  }))
  await ctx.close()
  return out
}
const flatW = (w: { W1: number[]; b1: number[]; W2: number[]; b2: number[] }) => [...w.W1, ...w.b1, ...w.W2, ...w.b2]

test('same actions, different intensity -> measurably different MLP after training', async ({ browser }) => {
  test.setTimeout(400_000)
  const calm = await trainedOutputs(browser, CALM)
  const calm2 = await trainedOutputs(browser, CALM) // control: same intensity, run again
  const rushed = await trainedOutputs(browser, RUSHED)
  const d = {
    outputsL1: { calmVsRushed: l1(calm.mlp, rushed.mlp), calmVsCalmControl: l1(calm.mlp, calm2.mlp) },
    weightsL1: { calmVsRushed: l1(flatW(calm.w), flatW(rushed.w)), calmVsCalmControl: l1(flatW(calm.w), flatW(calm2.w)) },
    features: { calm: calm.x, calm2: calm2.x, rushed: rushed.x },
    mlp: { calm: calm.mlp, calm2: calm2.mlp, rushed: rushed.mlp },
    stats: { calm: calm.stats, calm2: calm2.stats, rushed: rushed.stats },
  }
  recordMetrics('intensity_twoJourneys', d)
  // Identical action sequences: the last-action one-hot is identical, so any difference comes from intensity.
  expect(calm.x.slice(7)).toEqual(rushed.x.slice(7))
  expect(d.outputsL1.calmVsRushed).toBeGreaterThan(0.2)
  expect(d.outputsL1.calmVsRushed).toBeGreaterThan(2 * d.outputsL1.calmVsCalmControl)
  expect(d.weightsL1.calmVsRushed).toBeGreaterThan(1.5 * d.weightsL1.calmVsCalmControl)
})

test('intensity decides the next action where the action history cannot', async ({ page }) => {
  test.setTimeout(400_000)
  // After open-card the user favourites when calm and shares when rushed. Markov (history only)
  // sees a 50/50 split; only the MLP, which sees press/approach/dwell features, can separate them.
  await openFresh(page); resetMouse()
  const fav = ACTIONS.indexOf('favorite'), share = ACTIONS.indexOf('share')
  const cycle = async () => {
    await humanClick(page, 'nav-explore', CALM)
    await humanClick(page, 'open-card', CALM)
    const afterCalm = await page.evaluate(() => ({ mlp: window.__smartweb.cssOutputs(), markov: window.__smartweb.markov() }))
    await humanClick(page, 'favorite', CALM)
    await humanClick(page, 'nav-explore', RUSHED)
    await humanClick(page, 'open-card', RUSHED)
    const afterRushed = await page.evaluate(() => ({ mlp: window.__smartweb.cssOutputs(), markov: window.__smartweb.markov() }))
    await humanClick(page, 'share', RUSHED)
    return { afterCalm, afterRushed }
  }
  const history: { k: number; calmFavMinusShare: number; rushedShareMinusFav: number; markovCalmFav: number; markovRushedFav: number }[] = []
  let last!: Awaited<ReturnType<typeof cycle>>
  for (let k = 1; k <= 12; k++) {
    last = await cycle()
    history.push({
      k,
      calmFavMinusShare: last.afterCalm.mlp[fav] - last.afterCalm.mlp[share],
      rushedShareMinusFav: last.afterRushed.mlp[share] - last.afterRushed.mlp[fav],
      markovCalmFav: last.afterCalm.markov[fav], markovRushedFav: last.afterRushed.markov[fav],
    })
  }
  recordMetrics('intensity_branching', { history, final: last })
  const h = history.at(-1)!
  expect(h.calmFavMinusShare, JSON.stringify(history)).toBeGreaterThan(0)
  expect(h.rushedShareMinusFav, JSON.stringify(history)).toBeGreaterThan(0)
})
