import { CARDS, type Category } from '../cssnet/contract'

/**
 * Preference backbone: an intensity-weighted, decaying engagement count per card.
 * Scores are normalised within each category, so every category gets a full order.
 */
export interface AffinityState { counts: number[] }

export class Affinity {
  counts = new Float64Array(CARDS.length)
  readonly decay: number
  readonly prior: number
  constructor(decay = 0.97, prior = 1) { this.decay = decay; this.prior = prior }

  update(card: number, weight: number): void {
    const c = CARDS[card].category
    for (let k = 0; k < CARDS.length; k++) if (CARDS[k].category === c) this.counts[k] *= this.decay
    this.counts[card] += weight
  }

  /** Probabilities over all 18 cards, each category normalised on its own. */
  probs(): Float32Array {
    const out = new Float32Array(CARDS.length)
    const sums = new Map<Category, number>()
    const sizes = new Map<Category, number>()
    CARDS.forEach((k, i) => {
      sums.set(k.category, (sums.get(k.category) ?? this.prior) + this.counts[i])
      sizes.set(k.category, (sizes.get(k.category) ?? 0) + 1)
    })
    CARDS.forEach((k, i) => { out[i] = (this.counts[i] + this.prior / sizes.get(k.category)!) / sums.get(k.category)! })
    return out
  }

  toJSON(): AffinityState { return { counts: Array.from(this.counts) } }
  load(s: AffinityState): void {
    if (s.counts.length !== CARDS.length) throw new Error('affinity size mismatch')
    this.counts = Float64Array.from(s.counts)
  }
  reset(): void { this.counts.fill(0) }
}
