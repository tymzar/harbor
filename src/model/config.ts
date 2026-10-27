import { ACTIONS, type NetShape } from '../cssnet/contract'
import { MODEL_INPUTS } from '../signals/features'

export const SCHEMA_VERSION = 1
export const SHAPE: NetShape = { inputs: MODEL_INPUTS, hidden: 16, outputs: ACTIONS.length }

/** Cold-start prior over ACTIONS (sums to 1). */
export const PRIOR: readonly number[] = [0.15, 0.15, 0.12, 0.12, 0.16, 0.1, 0.08, 0.12]

/** lr 0.1: measured 0.95 rolling top-1 on a 5-step cycle after 125 steps (0.05 gave 0.65). */
export const SGD = { lr: 0.1, l2: 1e-4, clip: 5 }
export const MARKOV_DECAY = 0.97
export const MARKOV_PRIOR_STRENGTH = 1
/** MLP blend weight alpha(n) = BLEND_MAX * n / (n + BLEND_HALF). Markov dominates early. */
export const BLEND_MAX = 0.85
export const BLEND_HALF = 25
export const ACC_WINDOW = 20
export const INIT_SEED = 7
export const SAVE_DEBOUNCE_MS = 1000
export const STORE_KEY = 'smart-web/model'

export function blendAlpha(examples: number): number {
  return BLEND_MAX * examples / (examples + BLEND_HALF)
}
