/** Welford running mean/variance, per feature, with an optional mask of features to leave untouched. */
export interface NormStats {
  count: number
  mean: number[]
  m2: number[]
}

export const NORM_CLAMP = 4

/** Seed for the Welford state: `weight` pseudo-observations with this mean/std (per feature). */
export interface NormPrior { mean: readonly number[]; std: readonly number[]; weight: number }
/** The std never drops below this fraction of the prior std (guards against jitter amplification). */
export const MIN_STD_FRACTION = 0.25

export class RunningNorm {
  count = 0
  mean: Float64Array
  m2: Float64Array
  readonly mask: readonly boolean[]

  readonly size: number
  readonly prior: NormPrior | null
  constructor(size: number, mask?: readonly boolean[], prior?: NormPrior) {
    this.size = size
    this.mean = new Float64Array(size)
    this.m2 = new Float64Array(size)
    this.mask = mask ?? new Array(size).fill(true)
    this.prior = prior ?? null
    this.seed()
  }

  private seed(): void {
    const p = this.prior
    if (!p) return
    this.count = p.weight
    for (let i = 0; i < this.size; i++) {
      if (!this.mask[i]) continue
      this.mean[i] = p.mean[i]
      this.m2[i] = p.std[i] * p.std[i] * Math.max(1, p.weight - 1)
    }
  }

  update(x: ArrayLike<number>): void {
    this.count++
    for (let i = 0; i < this.size; i++) {
      if (!this.mask[i]) continue
      const d = x[i] - this.mean[i]
      this.mean[i] += d / this.count
      this.m2[i] += d * (x[i] - this.mean[i])
    }
  }

  variance(i: number): number {
    return this.count > 1 ? this.m2[i] / (this.count - 1) : 1
  }

  std(i: number): number {
    const floor = this.prior ? (this.prior.std[i] * MIN_STD_FRACTION) ** 2 : 1e-6
    return Math.sqrt(Math.max(this.variance(i), floor))
  }

  apply(x: ArrayLike<number>): Float32Array {
    const out = new Float32Array(this.size)
    for (let i = 0; i < this.size; i++) {
      if (!this.mask[i]) { out[i] = x[i]; continue }
      if (this.count < 2) { out[i] = 0; continue }
      const z = (x[i] - this.mean[i]) / this.std(i)
      out[i] = Math.max(-NORM_CLAMP, Math.min(NORM_CLAMP, z))
    }
    return out
  }

  toJSON(): NormStats {
    return { count: this.count, mean: Array.from(this.mean), m2: Array.from(this.m2) }
  }

  load(s: NormStats): void {
    if (s.mean.length !== this.size) throw new Error('norm stats size mismatch')
    this.count = s.count
    this.mean = Float64Array.from(s.mean)
    this.m2 = Float64Array.from(s.m2)
  }

  reset(): void {
    this.count = 0
    this.mean.fill(0)
    this.m2.fill(0)
    this.seed()
  }
}
