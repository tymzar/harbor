import type { CardId, Category, NetWeights, Verb } from '../cssnet/contract'
import type { NormStats } from '../signals/normalizer'
import type { AffinityState } from './affinity'

export interface SerialWeights { W1: number[]; b1: number[]; W2: number[]; b2: number[] }
export type Orders = Record<Category, CardId[]>

export interface PersistedModel {
  schemaVersion: number
  weights: SerialWeights
  normStats: NormStats
  affinity: AffinityState
  /** Running pointer intensity (normalised units), so a reload starts in the same context. */
  intensity: number[]
  /** Card order per category as last shown (hysteresis starts from here on reload). */
  orders: Orders | null
  /** Category usage counts (visits + half of card presses), decayed, and the shown category order. */
  categoryCounts?: number[]
  navOrder?: Category[] | null
  updatedAt: number
  examples: number
  acc?: { affinity: boolean[]; mlp: boolean[]; blend?: boolean[] }
}

export interface ModelStats {
  examples: number
  affinityAcc: number
  mlpAcc: number
  /** hit rate of the blended order (what is shown) */
  blendAcc: number
  /** how many predictions the rolling accuracies cover */
  accN: number
}

/** What the last press did to the model (for the activity table). */
export interface ModelEvent {
  card: CardId
  verb: Verb
  category: Category
  /** Training weight (verb x deliberation); 0 when deduplicated as a repeat. */
  weight: number
  counted: boolean
  /** Was the card already in the shown top 3 before this press? */
  hit: boolean
}

export interface ModelSnapshot {
  weights: NetWeights
  /** Network input for the current category (what the CSS net is fed). */
  x: Float32Array
  category: Category
  /** Network input for every category (for ordering categories you are not in). */
  xByCategory: Record<Category, number[]>
  /** Affinity probabilities, 18, normalised within each category. */
  affinity: Float32Array
  /** MLP probabilities computed in JS for every category's own context (18). */
  mlp: Float32Array
  /** Decayed engagement mass per category (how much evidence the order rests on). */
  evidence: Record<Category, number>
  /** Category ranking: normalised usage score per category (CATEGORIES order), its evidence, and the saved order. */
  categoryScores: number[]
  categoryEvidence: number
  navOrder: Category[] | null
  /** MLP weight in the blend. */
  alpha: number
  stats: ModelStats
  orders: Orders | null
  /** Set by step(), null otherwise. */
  lastEvent: ModelEvent | null
  updatedAt: number
}

export function serialWeights(w: NetWeights): SerialWeights {
  return { W1: Array.from(w.W1), b1: Array.from(w.b1), W2: Array.from(w.W2), b2: Array.from(w.b2) }
}
export function deserialWeights(w: SerialWeights): NetWeights {
  return { W1: Float32Array.from(w.W1), b1: Float32Array.from(w.b1), W2: Float32Array.from(w.W2), b2: Float32Array.from(w.b2) }
}
