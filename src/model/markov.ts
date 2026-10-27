/** Count-based first-order Markov next-action model with exponential decay and prior smoothing. */
export interface MarkovState { n: number; counts: number[]; decay: number; strength: number }

export class Markov {
  counts: Float64Array
  readonly n: number
  readonly prior: ArrayLike<number>
  readonly decay: number
  /** Pseudo-count mass of the prior. */
  readonly strength: number
  constructor(n: number, prior: ArrayLike<number>, decay = 0.97, strength = 1) {
    this.n = n; this.prior = prior; this.decay = decay; this.strength = strength
    this.counts = new Float64Array(n * n)
  }

  update(from: number | null, to: number): void {
    if (from === null) return
    const row = from * this.n
    for (let j = 0; j < this.n; j++) this.counts[row + j] *= this.decay
    this.counts[row + to] += 1
  }

  predict(from: number | null): Float32Array {
    const out = new Float32Array(this.n)
    if (from === null) {
      for (let j = 0; j < this.n; j++) out[j] = this.prior[j]
      return out
    }
    const row = from * this.n
    let s = this.strength
    for (let j = 0; j < this.n; j++) s += this.counts[row + j]
    for (let j = 0; j < this.n; j++) out[j] = (this.counts[row + j] + this.strength * this.prior[j]) / s
    return out
  }

  toJSON(): MarkovState {
    return { n: this.n, counts: Array.from(this.counts), decay: this.decay, strength: this.strength }
  }

  load(s: MarkovState): void {
    if (s.n !== this.n) throw new Error('markov size mismatch')
    this.counts = Float64Array.from(s.counts)
  }

  reset(): void { this.counts.fill(0) }
}
