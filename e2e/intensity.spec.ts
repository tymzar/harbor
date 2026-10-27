import { expect, test } from '@playwright/test'
import { CARD_IDS } from '../src/cssnet/contract'
import { CALM, RUSHED, engage, enter, openFresh, recordMetrics, resetMouse } from './helpers'

/**
 * Same category, same cards, but which card the user wants depends on how they have been
 * clicking: calm sessions open the Reading List, rushed sessions grab Saved Maps. Affinity
 * (counts) cannot separate them; the MLP sees the running pointer intensity.
 */
// Same pointer dynamics as CALM / RUSHED, with think time between visits so repeated presses
// are separate visits, not a rage burst (repeats within 1.5 s are deduplicated by design).
const CALM_VISIT = { ...CALM, gapMs: 1300 }
const RUSHED_VISIT = { ...RUSHED, gapMs: 1600 }

test('intensity changes the MLP ranking inside a category', async ({ page }) => {
  test.setTimeout(240_000)
  await openFresh(page); resetMouse()
  await enter(page, 'library', CALM)
  const ri = CARD_IDS.indexOf('reading'), mi = CARD_IDS.indexOf('maps')
  const mlp = () => page.evaluate(() => window.__smartweb.cssOutputs())
  for (let block = 0; block < 6; block++) {
    const calm = block % 2 === 0
    for (let k = 0; k < 7; k++) await engage(page, calm ? 'reading' : 'maps', calm ? 'open' : 'share', calm ? CALM_VISIT : RUSHED_VISIT)
  }
  for (let k = 0; k < 6; k++) await engage(page, 'reading', 'open', CALM_VISIT)
  const afterCalm = await mlp()
  for (let k = 0; k < 6; k++) await engage(page, 'maps', 'share', RUSHED_VISIT)
  const afterRushed = await mlp()
  const r = {
    afterCalm: { reading: afterCalm[ri], maps: afterCalm[mi] },
    afterRushed: { reading: afterRushed[ri], maps: afterRushed[mi] },
    stats: await page.evaluate(() => window.__smartweb.stats()),
  }
  recordMetrics('intensity', r)
  expect(afterCalm[ri], JSON.stringify(r)).toBeGreaterThan(afterCalm[mi])
  expect(afterRushed[mi], JSON.stringify(r)).toBeGreaterThan(afterRushed[ri])
})
