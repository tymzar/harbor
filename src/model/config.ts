import { CARDS, type NetShape } from '../cssnet/contract'
import { MODEL_INPUTS } from '../signals/features'

/** v2: per-category card ranking (18 masked outputs). v1 models (next-action) are discarded. */
export const SCHEMA_VERSION = 2
export const SHAPE: NetShape = { inputs: MODEL_INPUTS, hidden: 16, outputs: CARDS.length }

/** Cold-start prior: uniform within each category (each category has 6 cards). */
export const PRIOR: readonly number[] = CARDS.map(() => 1 / 6)

// lr 0.04 (was 0.08): at 0.08 the MLP mostly remembered the last press, so the top card flipped
// on a steady 60/40 preference about every 9 presses (src/model/stability.test.ts).
export const SGD = { lr: 0.04, l2: 1e-4, clip: 5 }
/** Affinity: per-event decay of a category's counts, and prior pseudo-count mass per category. */
export const AFFINITY_DECAY = 0.97
export const AFFINITY_PRIOR = 1
/** Smoothing of the running pointer intensity (weight of the newest click). */
export const INTENSITY_EMA = 0.3
/** The same press (card + verb) repeated within this window counts once (rage bursts collapse). */
export const DEDUPE_MS = 1500
export const VERB_WEIGHT = { open: 1, favorite: 1.5, unfavorite: -0.3, share: 1.5, search: 1.25, query: 0.3 } as const
/** Verbs that come from a pointer press (their weight is scaled by hover deliberation). */
export const POINTER_VERBS = new Set(['open', 'favorite', 'share'])
/** Category ranking: a visit counts 1, a card press counts this share of its weight to its category. */
export const CARD_TO_CATEGORY = 0.5
export const ACC_WINDOW = 20
/** MLP blend weight: 0 at first, grows to its share of recent accuracy after BLEND_RAMP examples. */
export const BLEND_RAMP = 20
export const BLEND_MIN = 0.1
// The MLP's share of the shown score is capped (was 0.7): its recency noise moved the top card.
export const BLEND_MAX = 0.35
export const INIT_SEED = 7
/**
 * Save after every training step (coalesced within one tick). IndexedDB writes of this small
 * model run in the worker; a 1 s debounce lost the last press when a tab closed (persona test).
 */
export const SAVE_DEBOUNCE_MS = 0
export const STORE_KEY = 'smart-web/model'

export function blendAlpha(examples: number, affinityAcc: number, mlpAcc: number): number {
  const ramp = Math.min(1, examples / BLEND_RAMP)
  const share = mlpAcc + affinityAcc > 0 ? mlpAcc / (mlpAcc + affinityAcc) : 0.5
  return ramp * Math.max(BLEND_MIN, Math.min(BLEND_MAX, share))
}
