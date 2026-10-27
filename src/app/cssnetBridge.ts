import type { ComponentType } from 'react'
import type { CssNet, CssNetMode, JsForward, MountCssNet, NetShape, NetWeights } from '../cssnet/contract'

/**
 * Agent B builds src/cssnet in parallel. import.meta.glob resolves to an empty
 * object when a file is absent, so this module (and the build) works whether
 * or not src/cssnet/index.ts, reference.ts or visual exist yet.
 */
const indexMods = import.meta.glob('../cssnet/index.ts')
const referenceMods = import.meta.glob('../cssnet/reference.ts')
const visualMods = import.meta.glob(['../cssnet/visual.tsx', '../cssnet/visual/index.ts', '../cssnet/visual/index.tsx'])

/** Local JS forward pass (ReLU hidden, softmax out), identical math to the worker MLP. */
export const localJsForward: JsForward = (shape, w, x) => {
  const { inputs: I, hidden: H, outputs: O } = shape
  const hidden = new Float32Array(H)
  for (let h = 0; h < H; h++) {
    let s = w.b1[h]
    for (let i = 0; i < I; i++) s += w.W1[h * I + i] * x[i]
    hidden[h] = Math.max(0, s)
  }
  const z = new Float32Array(O)
  let m = -Infinity
  for (let o = 0; o < O; o++) {
    let s = w.b2[o]
    for (let h = 0; h < H; h++) s += w.W2[o * H + h] * hidden[h]
    z[o] = s
    m = Math.max(m, s)
  }
  let sum = 0
  for (let o = 0; o < O; o++) { z[o] = Math.exp(z[o] - m); sum += z[o] }
  for (let o = 0; o < O; o++) z[o] /= sum
  return { hidden, out: z }
}

/** Fallback "net" with the CssNet interface, computed in JS. Used only when src/cssnet is missing or fails to mount. */
export function createFallbackNet(_host: HTMLElement, shape: NetShape, mode: CssNetMode): CssNet {
  let w: NetWeights = {
    W1: new Float32Array(shape.hidden * shape.inputs), b1: new Float32Array(shape.hidden),
    W2: new Float32Array(shape.outputs * shape.hidden), b2: new Float32Array(shape.outputs),
  }
  let x = new Float32Array(shape.inputs)
  return {
    shape, mode,
    setWeights(nw) { w = nw },
    setInputs(nx) { x = nx.slice() },
    readOutputs() { return localJsForward(shape, w, x).out },
    readHidden() { return localJsForward(shape, w, x).hidden },
    destroy() {},
  }
}

export interface CssNetVisuals {
  // Props are not part of contract.ts; the app passes { net, outputs, hidden, ranking, mode }.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PatternLayer?: ComponentType<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DotGrid?: ComponentType<any>
}

export interface CssNetModule {
  mount: MountCssNet | null
  jsForward: JsForward
  jsForwardSource: 'cssnet/reference' | 'local'
  visuals: CssNetVisuals
  errors: string[]
}

async function firstModule(mods: Record<string, () => Promise<unknown>>): Promise<Record<string, unknown> | null> {
  const loader = Object.values(mods)[0]
  return loader ? (await loader()) as Record<string, unknown> : null
}

export async function loadCssNetModule(): Promise<CssNetModule> {
  const errors: string[] = []
  let mount: MountCssNet | null = null
  let jsForward: JsForward = localJsForward
  let jsForwardSource: CssNetModule['jsForwardSource'] = 'local'
  const visuals: CssNetVisuals = {}
  try {
    const m = await firstModule(indexMods)
    if (!m) errors.push('src/cssnet/index.ts not found; using JS fallback net')
    else {
      const fn = (m.mountCssNet ?? m.default) as MountCssNet | undefined
      if (typeof fn === 'function') mount = ((h, sh, md) => (fn as (...a: unknown[]) => ReturnType<MountCssNet>)(h, sh, md, { nodes: true })) as MountCssNet
      else errors.push('src/cssnet/index.ts has no mountCssNet export')
      if (typeof m.jsForward === 'function') { jsForward = m.jsForward as JsForward; jsForwardSource = 'cssnet/reference' }
    }
  } catch (e) {
    errors.push(`cssnet index failed to load: ${(e as Error).message}`)
  }
  try {
    const r = await firstModule(referenceMods)
    if (r && typeof r.jsForward === 'function') { jsForward = r.jsForward as JsForward; jsForwardSource = 'cssnet/reference' }
  } catch (e) {
    errors.push(`cssnet reference failed to load: ${(e as Error).message}`)
  }
  try {
    const v = await firstModule(visualMods)
    if (v) {
      if (typeof v.PatternLayer === 'function') visuals.PatternLayer = v.PatternLayer as ComponentType
      if (typeof v.DotGrid === 'function') visuals.DotGrid = v.DotGrid as ComponentType
    }
  } catch (e) {
    errors.push(`cssnet visual failed to load: ${(e as Error).message}`)
  }
  return { mount, jsForward, jsForwardSource, visuals, errors }
}

export interface MountedNet { net: CssNet; source: 'cssnet' | 'fallback'; error?: string }

export function mountNet(mod: CssNetModule, host: HTMLElement, shape: NetShape, mode: CssNetMode): MountedNet {
  if (mod.mount) {
    try {
      return { net: mod.mount(host, shape, mode), source: 'cssnet' }
    } catch (e) {
      return { net: createFallbackNet(host, shape, mode), source: 'fallback', error: `mountCssNet threw: ${(e as Error).message}` }
    }
  }
  return { net: createFallbackNet(host, shape, mode), source: 'fallback' }
}

/** True if p looks like a probability vector (finite, non-negative, sums to ~1). */
export function isProbVector(p: ArrayLike<number>, n: number): boolean {
  if (!p || p.length !== n) return false
  let s = 0
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(p[i]) || p[i] < -1e-6) return false
    s += p[i]
  }
  return Math.abs(s - 1) < 0.05
}
