/** Welford running mean/variance, per feature, with an optional mask of features to leave untouched. */
export interface NormStats {
  count: number
  mean: number[]
  m2: number[]
}

export const NORM_CLAMP = 4

export class RunningNorm {
  count = 0
  mean: Float64Array
  m2: Float64Array
  readonly mask: readonly boolean[]

  constructor(readonly size: number, mask?: readonly boolean[]) {
    this.mean = new Float64Array(size)
    this.m2 = new Float64Array(size)
    this.mask = mask ?? new Array(size).fill(true)
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
    return Math.sqrt(Math.max(this.variance(i), 1e-6))
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
  }
}
