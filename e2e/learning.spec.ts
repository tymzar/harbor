import { expect, test } from '@playwright/test'
import type { ActionId } from '../src/cssnet/contract'
import { NORMAL, humanClick, openFresh, recordMetrics, resetMouse, stats, topSuggestion } from './helpers'

const JOURNEY: ActionId[] = ['nav-home', 'nav-explore', 'open-card', 'favorite']
const next = (a: ActionId) => JOURNEY[(JOURNEY.indexOf(a) + 1) % JOURNEY.length]

test('learns a repeated journey from realistic pointer input', async ({ page }) => {
  await openFresh(page); resetMouse()
  const perRep: { rep: number; markovAcc: number; mlpAcc: number; examples: number; top: string | null }[] = []
  let crossedAt: number | null = null
  for (let rep = 1; rep <= 8; rep++) {
    for (const a of JOURNEY) await humanClick(page, a, NORMAL)
    const s = await stats(page)
    perRep.push({ rep, markovAcc: s.markovAcc, mlpAcc: s.mlpAcc, examples: s.examples, top: await topSuggestion(page) })
    if (crossedAt === null && s.markovAcc > 0.6) crossedAt = rep
  }
  recordMetrics('learning', { journey: JOURNEY, perRep, markovAccAbove06AtRep: crossedAt })
  expect(crossedAt, JSON.stringify(perRep)).not.toBeNull()
  expect(perRep.at(-1)!.markovAcc).toBeGreaterThan(0.6)

  // The panel's top suggestion is the journey's next step, at every step of a further repetition.
  for (const a of JOURNEY) {
    await humanClick(page, a, NORMAL)
    await expect.poll(() => topSuggestion(page), { message: `after ${a}` }).toBe(next(a))
    expect((await page.evaluate(() => window.__smartweb.ranking()))[0]).toBe(next(a))
  }
})
