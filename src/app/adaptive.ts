import { ACTIONS, type ActionId } from '../cssnet/contract'

/** Controls that live in the adaptive grid (nav buttons stay fixed in the top bar). */
export const GRID_ACTIONS: readonly ActionId[] = ['open-card', 'favorite', 'share', 'search', 'settings']

export const ADAPT = {
  /** The moving element's probability must beat its prior by this much. */
  priorMargin: 0.06,
  /** ...and beat the element it displaces by this much (hysteresis). */
  swapMargin: 0.03,
}

export function rank(scores: ArrayLike<number>): ActionId[] {
  return ACTIONS.map((a, i) => ({ a, s: scores[i], i }))
    .sort((p, q) => q.s - p.s || p.i - q.i)
    .map((r) => r.a)
}

/**
 * Guarded reorder: compute the score-sorted order, then move at most ONE
 * element (the first out-of-place one) to its target slot, and only if its
 * probability beats its prior by priorMargin and the displaced element by swapMargin.
 */
export function nextGridOrder(
  current: readonly ActionId[],
  scores: ArrayLike<number>,
  prior: ArrayLike<number>,
  opts = ADAPT,
): { order: ActionId[]; moved: ActionId | null } {
  const score = (a: ActionId) => scores[ACTIONS.indexOf(a)]
  const desired = [...current].sort((a, b) => score(b) - score(a) || current.indexOf(a) - current.indexOf(b))
  const i = current.findIndex((a, k) => a !== desired[k])
  if (i < 0) return { order: [...current], moved: null }
  const mover = desired[i]
  const displaced = current[i]
  const pi = ACTIONS.indexOf(mover)
  if (score(mover) - prior[pi] < opts.priorMargin) return { order: [...current], moved: null }
  if (score(mover) - score(displaced) < opts.swapMargin) return { order: [...current], moved: null }
  const order = current.filter((a) => a !== mover)
  order.splice(i, 0, mover)
  return { order, moved: mover }
}

/** Blend Markov and MLP probabilities: (1 - alpha) * markov + alpha * mlp. */
export function blend(markov: ArrayLike<number>, mlp: ArrayLike<number>, alpha: number): Float32Array {
  const out = new Float32Array(markov.length)
  for (let i = 0; i < out.length; i++) out[i] = (1 - alpha) * markov[i] + alpha * mlp[i]
  return out
}
