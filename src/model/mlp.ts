import type { NetShape, NetWeights } from '../cssnet/contract'
import { MASK_PENALTY } from '../cssnet/generate'

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function softmax(z: ArrayLike<number>): Float32Array {
  let m = -Infinity
  for (let i = 0; i < z.length; i++) m = Math.max(m, z[i])
  const out = new Float32Array(z.length)
  let s = 0
  for (let i = 0; i < z.length; i++) { out[i] = Math.exp(z[i] - m); s += out[i] }
  for (let i = 0; i < z.length; i++) out[i] /= s
  return out
}

/**
 * Cold-start prior: output biases = log(prior) and small W2, so an untrained
 * net emits roughly the prior.
 */
export function initWeights(shape: NetShape, prior: ArrayLike<number>, seed = 1): NetWeights {
  const rnd = mulberry32(seed)
  const gauss = () => {
    const u = Math.max(rnd(), 1e-9)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())
  }
  const W1 = new Float32Array(shape.hidden * shape.inputs)
  const he = Math.sqrt(2 / shape.inputs)
  for (let i = 0; i < W1.length; i++) W1[i] = gauss() * he
  const b1 = new Float32Array(shape.hidden).fill(0.01)
  const W2 = new Float32Array(shape.outputs * shape.hidden)
  for (let i = 0; i < W2.length; i++) W2[i] = gauss() * 0.01
  const b2 = new Float32Array(shape.outputs)
  for (let o = 0; o < shape.outputs; o++) b2[o] = Math.log(Math.max(prior[o], 1e-6))
  return { W1, b1, W2, b2 }
}

export function cloneWeights(w: NetWeights): NetWeights {
  return { W1: w.W1.slice(), b1: w.b1.slice(), W2: w.W2.slice(), b2: w.b2.slice() }
}

export function forward(shape: NetShape, w: NetWeights, x: ArrayLike<number>, mask?: ArrayLike<number> | null): { hidden: Float32Array; out: Float32Array; logits: Float32Array } {
  const { inputs: I, hidden: H, outputs: O } = shape
  const hidden = new Float32Array(H)
  for (let h = 0; h < H; h++) {
    let s = w.b1[h]
    for (let i = 0; i < I; i++) s += w.W1[h * I + i] * x[i]
    hidden[h] = s > 0 ? s : 0
  }
  const logits = new Float32Array(O)
  for (let o = 0; o < O; o++) {
    let s = w.b2[o]
    for (let h = 0; h < H; h++) s += w.W2[o * H + h] * hidden[h]
    if (mask && !mask[o]) s -= MASK_PENALTY
    logits[o] = s
  }
  return { hidden, out: softmax(logits), logits }
}

export interface SgdOptions { lr: number; l2: number; clip?: number }

/**
 * One SGD step on (masked) softmax cross-entropy + L2 (weights only), scaled by a sample
 * weight. Mutates w. Returns the loss before the step. Masked outputs have ~0 probability,
 * so their gradients vanish: the step only reshapes the scores inside the label's category.
 */
export function sgdStep(shape: NetShape, w: NetWeights, x: ArrayLike<number>, label: number, opt: SgdOptions, mask?: ArrayLike<number> | null, weight = 1): number {
  const { inputs: I, hidden: H, outputs: O } = shape
  const { hidden, out } = forward(shape, w, x, mask)
  opt = { ...opt, lr: opt.lr * weight }
  const loss = -Math.log(Math.max(out[label], 1e-9))
  const clip = opt.clip ?? 5
  const c = (g: number) => Math.max(-clip, Math.min(clip, g))
  const dz = new Float32Array(O)
  for (let o = 0; o < O; o++) dz[o] = out[o] - (o === label ? 1 : 0)
  const dh = new Float32Array(H)
  for (let h = 0; h < H; h++) {
    if (hidden[h] <= 0) continue
    let s = 0
    for (let o = 0; o < O; o++) s += w.W2[o * H + h] * dz[o]
    dh[h] = s
  }
  for (let o = 0; o < O; o++) {
    for (let h = 0; h < H; h++) {
      const k = o * H + h
      w.W2[k] -= opt.lr * c(dz[o] * hidden[h] + opt.l2 * w.W2[k])
    }
    w.b2[o] -= opt.lr * c(dz[o])
  }
  for (let h = 0; h < H; h++) {
    if (dh[h] === 0) continue
    for (let i = 0; i < I; i++) {
      const k = h * I + i
      w.W1[k] -= opt.lr * c(dh[h] * x[i] + opt.l2 * w.W1[k])
    }
    w.b1[h] -= opt.lr * c(dh[h])
  }
  return loss
}

export function argmax(p: ArrayLike<number>): number {
  let best = 0
  for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i
  return best
}
