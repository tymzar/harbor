import { describe, expect, it } from 'vitest'
import { jsForward, jsLogits, mulberry32, randomWeights, zeroWeights } from './reference'
import type { NetShape } from './contract'

const shape: NetShape = { inputs: 3, hidden: 2, outputs: 2 }

describe('jsForward', () => {
  it('computes relu hidden and softmax outputs for a hand-worked example', () => {
    const w = zeroWeights(shape)
    w.W1.set([1, 0, 0, 0, -1, 0]) // h0 = x0, h1 = -x1
    w.b1.set([0.5, 0])
    w.W2.set([1, 0, 0, 1]) // z0 = h0, z1 = h1
    w.b2.set([0, 1])
    const { hidden, out } = jsForward(shape, w, Float32Array.from([2, 3, 9]))
    expect(Array.from(hidden)).toEqual([2.5, 0]) // relu(-3) = 0
    const z0 = 2.5, z1 = 1
    const e0 = Math.exp(z0), e1 = Math.exp(z1)
    expect(out[0]).toBeCloseTo(e0 / (e0 + e1), 6)
    expect(out[1]).toBeCloseTo(e1 / (e0 + e1), 6)
    expect(Array.from(jsLogits(shape, w, Float32Array.from([2, 3, 9])))).toEqual([2.5, 1])
  })
  it('outputs a probability vector and is stable for large logits', () => {
    const w = zeroWeights(shape)
    w.b2.set([1000, 999])
    const { out } = jsForward(shape, w, new Float32Array(3))
    expect(out[0] + out[1]).toBeCloseTo(1, 6)
    expect(out[0]).toBeGreaterThan(out[1])
    expect(Number.isFinite(out[0])).toBe(true)
  })
  it('randomWeights is deterministic per seed and mulberry32 is in [0,1)', () => {
    const a = randomWeights(shape, 5), b = randomWeights(shape, 5), c = randomWeights(shape, 6)
    expect(Array.from(a.W1)).toEqual(Array.from(b.W1))
    expect(Array.from(a.W1)).not.toEqual(Array.from(c.W1))
    const r = mulberry32(1)
    for (let i = 0; i < 100; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
})
