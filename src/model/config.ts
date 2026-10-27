import { CARDS, type NetShape } from '../cssnet/contract'
import { MODEL_INPUTS } from '../signals/features'

/** v2: per-category card ranking (18 masked outputs). v1 models (next-action) are discarded. */
export const SCHEMA_VERSION = 2
export const SHAPE: NetShape = { inputs: MODEL_INPUTS, hidden: 16, outputs: CARDS.length }

/** Cold-start prior: uniform within each category (each category has 6 cards). */
export const PRIOR: readonly number[] = CARDS.map(() => 1 / 6)

export const SGD = { lr: 0.08, l2: 1e-4, clip: 5 }
/** Affinity: per-event decay of a category's counts, and prior pseudo-count mass per category. */
export const AFFINITY_DECAY = 0.97
export const AFFINITY_PRIOR = 1
/** Smoothing of the running pointer intensity (weight of the newest click). */
export const INTENSITY_EMA = 0.3
/** The same press (card + verb) repeated within this window counts once (rage bursts collapse). */
export const DEDUPE_MS = 1500
export const VERB_WEIGHT = { open: 1, favorite: 1.5, share: 1.5 } as const
export const ACC_WINDOW = 20
/** MLP blend weight: 0 at first, grows to its share of recent accuracy after BLEND_RAMP examples. */
export const BLEND_RAMP = 20
export const BLEND_MIN = 0.1
export const BLEND_MAX = 0.7
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
