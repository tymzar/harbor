import { CARDS, CATEGORIES } from '../cssnet/contract'

/**
 * Preference backbone: an intensity-weighted, decaying engagement count per item.
 * Scores are normalised within each group, so every group gets a full order.
 * `groupOf[i]` is item i's group index (Harbor: its category).
 */
export interface AffinityState { counts: number[] }

const HARBOR_GROUP_OF = CARDS.map((k) => CATEGORIES.indexOf(k.category))

export class Affinity {
  counts: Float64Array
  readonly decay: number
  readonly prior: number
  private readonly groupOf: readonly number[]
  private readonly groupSize: number[]
  constructor(decay = 0.97, prior = 1, groupOf: readonly number[] = HARBOR_GROUP_OF) {
    this.decay = decay
    this.prior = prior
    this.groupOf = groupOf
    this.counts = new Float64Array(groupOf.length)
    this.groupSize = []
    for (const g of groupOf) this.groupSize[g] = (this.groupSize[g] ?? 0) + 1
  }

  update(item: number, weight: number): void {
    const g = this.groupOf[item]
    for (let k = 0; k < this.counts.length; k++) if (this.groupOf[k] === g) this.counts[k] *= this.decay
    this.counts[item] += weight
  }

  /** A small step back (e.g. an unfavorite): no decay, since it is not a use, and never below zero. */
  lower(item: number, amount: number): void {
    this.counts[item] = Math.max(0, this.counts[item] - amount)
  }

  /** Probabilities over all items, each group normalised on its own. */
  probs(): Float32Array {
    const sums = this.groupSize.map(() => this.prior)
    this.groupOf.forEach((g, i) => { sums[g] += this.counts[i] })
    return Float32Array.from(this.groupOf, (g, i) => (this.counts[i] + this.prior / this.groupSize[g]) / sums[g])
  }

  toJSON(): AffinityState { return { counts: Array.from(this.counts) } }
  load(s: AffinityState): void {
    if (s.counts.length !== this.counts.length) throw new Error('affinity size mismatch')
    this.counts = Float64Array.from(s.counts)
  }
  reset(): void { this.counts.fill(0) }
}
