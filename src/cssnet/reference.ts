import type { JsForward, NetShape, NetWeights } from './contract'

/**
 * Pure-JS reference forward pass: hidden = relu(W1 x + b1), out = softmax(W2 hidden + b2).
 * Accumulates in doubles; results are returned as Float32Array per the contract.
 * This is the ground truth the CSS modes are compared against in parity.check.mjs.
 */
export const jsForward: JsForward = (shape: NetShape, w: NetWeights, x: Float32Array) => {
  const { inputs: I, hidden: H, outputs: O } = shape
  const hidden = new Float32Array(H)
  for (let h = 0; h < H; h++) {
    let s = w.b1[h]
    const row = h * I
    for (let i = 0; i < I; i++) s += w.W1[row + i] * x[i]
    hidden[h] = s > 0 ? s : 0
  }
  const out = new Float32Array(O)
  let m = -Infinity
  for (let o = 0; o < O; o++) {
    let s = w.b2[o]
    const row = o * H
    for (let h = 0; h < H; h++) s += w.W2[row + h] * hidden[h]
    out[o] = s
    if (s > m) m = s
  }
  let sum = 0
  for (let o = 0; o < O; o++) { const e = Math.exp(out[o] - m); out[o] = e; sum += e }
  for (let o = 0; o < O; o++) out[o] /= sum
  return { hidden, out }
}

/** Logits before softmax (used by tests and the parity script). */
export function jsLogits(shape: NetShape, w: NetWeights, x: Float32Array): Float32Array {
  const { inputs: I, hidden: H, outputs: O } = shape
  const z = new Float32Array(O)
  const hid = new Float64Array(H)
  for (let h = 0; h < H; h++) {
    let s = w.b1[h]
    for (let i = 0; i < I; i++) s += w.W1[h * I + i] * x[i]
    hid[h] = s > 0 ? s : 0
  }
  for (let o = 0; o < O; o++) {
    let s = w.b2[o]
    for (let h = 0; h < H; h++) s += w.W2[o * H + h] * hid[h]
    z[o] = s
  }
  return z
}

export function zeroWeights(shape: NetShape): NetWeights {
  return {
    W1: new Float32Array(shape.hidden * shape.inputs), b1: new Float32Array(shape.hidden),
    W2: new Float32Array(shape.outputs * shape.hidden), b2: new Float32Array(shape.outputs),
  }
}

/** Deterministic PRNG (mulberry32) for tests and parity runs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random weights with magnitudes that keep hidden pre-activations well inside the animation sampling window. */
export function randomWeights(shape: NetShape, seed = 1, scale = { w1: 0.3, b1: 0.3, w2: 0.8, b2: 0.3 }): NetWeights {
  const r = mulberry32(seed)
  const u = (s: number) => (r() * 2 - 1) * s
  return {
    W1: Float32Array.from({ length: shape.hidden * shape.inputs }, () => u(scale.w1)),
    b1: Float32Array.from({ length: shape.hidden }, () => u(scale.b1)),
    W2: Float32Array.from({ length: shape.outputs * shape.hidden }, () => u(scale.w2)),
    b2: Float32Array.from({ length: shape.outputs }, () => u(scale.b2)),
  }
}
