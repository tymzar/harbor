import { CARDS, CARD_IDS, CATEGORIES, cardsOf, type CardId, type Category } from '../cssnet/contract'
import type { Orders } from '../model/types'

/**
 * Hysteresis: a card only passes the one above it when its score is higher by this much,
 * so near-ties do not flip back and forth on every click. A clear preference still
 * re-sorts the whole category in one pass.
 */
export const SWAP_MARGIN = 0.01
/** A card passes another when it leads by about this many (decayed, weighted) presses. */
export const SWAP_PRESSES = 0.6
/**
 * Affinity is (count + prior/6) / (evidence + 1), so a lead of SWAP_PRESSES presses is a score
 * gap of SWAP_PRESSES / (evidence + 1). Two equally used favourites settle at about +-0.5 presses
 * apart (decay 0.97), so they do not swap on every press; a single press over zero still counts.
 */
export function swapMargin(evidence: number): number {
  return SWAP_MARGIN + SWAP_PRESSES / (evidence + 1)
}
/**
 * Evidence before a category starts reordering: the decayed engagement mass in that
 * category must reach this (about two deliberate presses).
 */
export const MIN_EVIDENCE = 1.8

export function defaultOrders(): Orders {
  return Object.fromEntries(CATEGORIES.map((c) => [c, cardsOf(c)])) as Orders
}

/** Blend per card: (1 - alpha) * affinity + alpha * mlp. */
export function blendScores(affinity: ArrayLike<number>, mlp: ArrayLike<number>, alpha: number): number[] {
  return Array.from(affinity, (a, i) => (1 - alpha) * a + alpha * mlp[i])
}

/**
 * Re-sort `prev` by score, with hysteresis: repeated adjacent passes that swap a pair only
 * when the lower card beats the upper one by more than `margin`. Converges to an order with
 * no adjacent pair out of place by more than `margin` (a full reorder if the evidence says so).
 */
export function reorder(prev: readonly CardId[], scores: ArrayLike<number>, margin = SWAP_MARGIN): CardId[] {
  const s = (id: CardId) => scores[CARD_IDS.indexOf(id)]
  const out = [...prev]
  for (let pass = 0; pass < out.length; pass++) {
    let swapped = false
    for (let i = 0; i + 1 < out.length; i++) {
      if (s(out[i + 1]) - s(out[i]) > margin) { [out[i], out[i + 1]] = [out[i + 1], out[i]]; swapped = true }
    }
    if (!swapped) break
  }
  return out
}

/** Decayed engagement mass per category, from the affinity probabilities' backing counts. */
export function evidence(counts: ArrayLike<number>, c: Category): number {
  let e = 0
  CARDS.forEach((k, i) => { if (k.category === c) e += counts[i] })
  return e
}

/** Cards whose slot changed between two orders. */
export function movedCards(a: readonly CardId[], b: readonly CardId[]): CardId[] {
  return b.filter((id, i) => a[i] !== id)
}
