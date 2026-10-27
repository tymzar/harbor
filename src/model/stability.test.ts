import { describe, expect, it } from 'vitest'
import { cardsOf, type CardId } from '../cssnet/contract'
import { MIN_EVIDENCE, blendScores, reorder, swapMargin } from '../app/adaptive'
import { ModelEngine } from './engine'

/**
 * How calm is the shown order? The real engine and the real hysteresis, driven by a person who
 * prefers Team over Calendar 60/40 (with natural pointer jitter), then switches to Drafts.
 * Before tuning (lr 0.08, MLP share up to 0.5, 0.6-press margin): ~30 top-slot flips in 260
 * presses, new favourite on top after ~24 presses. After: ~5.5 flips, ~28 presses.
 */
const L = Math.log1p
const NEUTRAL = [L(100), 0.5, 0.2, 0.8, L(0.6), L(90), 1, 0, 1]

function simulate(seed: number) {
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const e = new ModelEngine(() => 0)
  e.predict(NEUTRAL, 'home')
  let order: CardId[] = cardsOf('home')
  let t = 0, flips = 0, adapt = -1
  for (let n = 0; n < 420; n++) {
    const r = rnd()
    const card: CardId = n < 300 ? (r < 0.6 ? 'team' : 'calendar') : r < 0.7 ? 'drafts' : r < 0.85 ? 'team' : 'calendar'
    const raw = NEUTRAL.map((v, i) => (i < 7 ? v * (0.85 + rnd() * 0.3) : v))
    const snap = e.step(raw, card, 'open', 'home', (t += 2500))
    if (snap.evidence.home < MIN_EVIDENCE) continue
    const next = reorder(order, blendScores(snap.affinity, snap.mlp, snap.alpha), swapMargin(snap.evidence.home))
    if (n >= 40 && n < 300 && next[0] !== order[0]) flips++
    if (n >= 300 && adapt < 0 && next[0] === 'drafts') adapt = n - 299
    order = next
  }
  return { flips, adapt }
}

describe('order stability', () => {
  const runs = [1, 2, 3, 4, 5, 6, 7, 8].map(simulate)
  const mean = (k: 'flips' | 'adapt') => runs.reduce((a, r) => a + r[k], 0) / runs.length

  it('a steady 60/40 preference rarely changes the top card', () => {
    expect(mean('flips')).toBeLessThan(8)
  })
  it('a real change of habit still reaches the top within ~30 presses', () => {
    expect(runs.every((r) => r.adapt > 0)).toBe(true)
    expect(mean('adapt')).toBeLessThan(32)
  })
  it('a fresh model still responds to the first presses', () => {
    expect(swapMargin(MIN_EVIDENCE)).toBeLessThan(0.3)
  })
})
