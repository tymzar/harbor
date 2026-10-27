import type { NetWeights } from '../cssnet/contract'
import type { NormStats } from '../signals/normalizer'
import type { MarkovState } from './markov'

export interface SerialWeights { W1: number[]; b1: number[]; W2: number[]; b2: number[] }

export interface PersistedModel {
  schemaVersion: number
  weights: SerialWeights
  normStats: NormStats
  markov: MarkovState
  updatedAt: number
  examples: number
  lastAction: number | null
  acc?: { markov: boolean[]; mlp: boolean[] }
}

export interface ModelStats {
  examples: number
  markovAcc: number
  mlpAcc: number
  /** how many predictions the rolling accuracies cover */
  accN: number
}

export interface ModelSnapshot {
  weights: NetWeights
  /** Normalised feature vector that the next prediction uses. */
  x: Float32Array
  markov: Float32Array
  /** MLP probabilities computed in JS inside the worker. */
  mlp: Float32Array
  /** MLP weight in the blend. */
  alpha: number
  stats: ModelStats
  updatedAt: number
}

export function serialWeights(w: NetWeights): SerialWeights {
  return { W1: Array.from(w.W1), b1: Array.from(w.b1), W2: Array.from(w.W2), b2: Array.from(w.b2) }
}
export function deserialWeights(w: SerialWeights): NetWeights {
  return { W1: Float32Array.from(w.W1), b1: Float32Array.from(w.b1), W2: Float32Array.from(w.W2), b2: Float32Array.from(w.b2) }
}
