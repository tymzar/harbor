import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACTIONS, type ActionId } from '../cssnet/contract'
import { BLEND_MAX, PRIOR, SHAPE, blendAlpha } from './config'
import { ModelEngine, validatePersisted } from './engine'
import { Markov } from './markov'
import { argmax, cloneWeights, forward, initWeights, mulberry32, sgdStep } from './mlp'
import { debouncedSaver, memoryStore } from './persist'
import { createHandler } from './protocol'
import { decodeFragment, encodeFragment, fragmentParam } from './quantize'
import { ModelClient } from './client'

const small = { inputs: 3, hidden: 4, outputs: 3 }

function oneHotRaw(a: ActionId, rnd = mulberry32(3)): number[] {
  const raw = Array.from({ length: SHAPE.inputs }, (_, i) => (i < 7 ? rnd() : 0))
  raw[7 + ACTIONS.indexOf(a)] = 1
  return raw
}

describe('MLP', () => {
  it('cold start emits the prior', () => {
    const w = initWeights(SHAPE, PRIOR)
    const { out } = forward(SHAPE, w, new Float32Array(SHAPE.inputs).fill(0.5))
    PRIOR.forEach((p, i) => expect(out[i]).toBeCloseTo(p, 1))
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
  })

  it('analytic gradient matches finite differences', () => {
    const w = initWeights(small, [0.3, 0.3, 0.4], 11)
    // make W2 non-trivial so dh != 0
    w.W2.forEach((_, i) => { w.W2[i] = Math.sin(i + 1) * 0.5 })
    const x = [0.4, -0.7, 1.1]
    const label = 2
    const loss = (ww: typeof w) => -Math.log(forward(small, ww, x).out[label])
    const lr = 1e-3
    const after = cloneWeights(w)
    sgdStep(small, after, x, label, { lr, l2: 0 })
    for (const key of ['W1', 'b1', 'W2', 'b2'] as const) {
      for (let k = 0; k < w[key].length; k++) {
        const analytic = (w[key][k] - after[key][k]) / lr
        const eps = 1e-3
        const plus = cloneWeights(w); plus[key][k] += eps
        const minus = cloneWeights(w); minus[key][k] -= eps
        const numeric = (loss(plus) - loss(minus)) / (2 * eps)
        expect(analytic).toBeCloseTo(numeric, 2)
      }
    }
  })

  it('learns a deterministic transition by SGD', () => {
    const w = initWeights(SHAPE, PRIOR, 5)
    const next: Record<string, ActionId> = { 'nav-explore': 'open-card', 'open-card': 'favorite', favorite: 'nav-explore' }
    const seq = Object.keys(next) as ActionId[]
    for (let epoch = 0; epoch < 60; epoch++) {
      for (const a of seq) sgdStep(SHAPE, w, oneHotRaw(a), ACTIONS.indexOf(next[a]), { lr: 0.05, l2: 1e-4 })
    }
    for (const a of seq) expect(ACTIONS[argmax(forward(SHAPE, w, oneHotRaw(a)).out)]).toBe(next[a])
  })
})

describe('Markov', () => {
  it('falls back to the prior and decays old counts', () => {
    const m = new Markov(3, [0.2, 0.3, 0.5], 0.5, 1)
    expect(Array.from(m.predict(null))).toEqual([0.2, 0.3, 0.5].map(Math.fround))
    m.update(0, 1); m.update(0, 1); m.update(0, 2)
    // counts row0 after decay: [0, 0.5*... ] -> 1 then 1.5*0.5... check sums
    const p = m.predict(0)
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    expect(argmax(p)).toBe(2) // most recent wins under strong decay
    m.update(null, 0) // no-op
  })
})

describe('ModelEngine', () => {
  it('uses label delay: trains only after the next action arrives', () => {
    const e = new ModelEngine(() => 1)
    e.predict(oneHotRaw('nav-home'))
    expect(e.examples).toBe(0)
    e.step(oneHotRaw('nav-explore'), 'nav-explore')
    expect(e.examples).toBe(1)
    const s = e.step(oneHotRaw('open-card'), 'open-card')
    expect(s.stats.examples).toBe(2)
    expect(s.stats.accN).toBe(2)
  })

  it('learns a cyclic journey: Markov and MLP accuracy rise', () => {
    const e = new ModelEngine(() => 1)
    const cycle: ActionId[] = ['nav-explore', 'open-card', 'favorite', 'share', 'nav-library']
    e.predict(oneHotRaw('nav-home'))
    let s = e.snapshot()
    for (let k = 0; k < 150; k++) s = e.step(oneHotRaw(cycle[k % cycle.length], mulberry32(k)), cycle[k % cycle.length])
    expect(s.stats.markovAcc).toBe(1)
    expect(s.stats.mlpAcc).toBeGreaterThanOrEqual(0.8)
    expect(s.alpha).toBeGreaterThan(0.6)
    expect(s.alpha).toBeLessThan(BLEND_MAX)
  })

  it('round-trips through toPersisted/load and rejects bad shapes', () => {
    const e = new ModelEngine()
    e.predict(oneHotRaw('nav-home'))
    for (let k = 0; k < 10; k++) e.step(oneHotRaw('search'), 'search')
    const p = e.toPersisted()
    const f = new ModelEngine()
    f.load(JSON.parse(JSON.stringify(p)))
    expect(f.examples).toBe(e.examples)
    expect(Array.from(f.weights.W1)).toEqual(Array.from(e.weights.W1))
    expect(() => validatePersisted({ ...p, schemaVersion: 99 })).toThrow(/schemaVersion/)
    expect(() => validatePersisted({ ...p, weights: { ...p.weights, b2: [1] } })).toThrow(/shapes/)
    expect(() => validatePersisted({ ...p, weights: { ...p.weights, b1: p.weights.b1.map(() => NaN) } })).toThrow(/finite/)
  })

  it('blend alpha starts at 0 and grows', () => {
    expect(blendAlpha(0)).toBe(0)
    expect(blendAlpha(25)).toBeCloseTo(BLEND_MAX / 2)
    expect(blendAlpha(1000)).toBeLessThan(BLEND_MAX)
  })
})

describe('fragment quantisation', () => {
  it('round-trips within int8 precision', () => {
    const e = new ModelEngine()
    e.predict(oneHotRaw('nav-home'))
    for (let k = 0; k < 30; k++) e.step(oneHotRaw(ACTIONS[k % 8], mulberry32(k)), ACTIONS[k % 8])
    const p = e.toPersisted()
    const frag = encodeFragment(p)
    expect(frag).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(frag.length).toBeLessThan(900)
    const d = decodeFragment(frag, p)
    validatePersisted(d)
    const maxAbs = Math.max(...p.weights.W1.map(Math.abs))
    p.weights.W1.forEach((v, i) => expect(Math.abs(v - d.weights.W1[i])).toBeLessThanOrEqual(maxAbs / 127 / 2 + 1e-6))
    expect(d.examples).toBe(p.examples)
    expect(d.lastAction).toBe(p.lastAction)
    expect(() => decodeFragment('AAAA', p)).toThrow()
  })
  it('parses the m= hash parameter', () => {
    expect(fragmentParam('#m=abc')).toBe('abc')
    expect(fragmentParam('#x=1&m=zz')).toBe('zz')
    expect(fragmentParam('')).toBeNull()
  })
})

describe('persistence', () => {
  afterEach(() => { vi.useRealTimers() })
  it('debounces saves to one per burst', async () => {
    vi.useFakeTimers()
    const store = memoryStore()
    let v = 0
    const e = new ModelEngine()
    const saver = debouncedSaver(store, () => ({ ...e.toPersisted(), examples: ++v }), 1000)
    saver.schedule(); saver.schedule(); saver.schedule()
    await vi.advanceTimersByTimeAsync(999)
    expect(store.saves).toBe(0)
    await vi.advanceTimersByTimeAsync(2)
    expect(store.saves).toBe(1)
  })

  it('handler restores from the store, imports a fragment, and resets to prior', async () => {
    const store = memoryStore()
    const h1 = createHandler(store)
    await h1({ type: 'init', raw: oneHotRaw('nav-home') })
    for (let k = 0; k < 5; k++) await h1({ type: 'step', raw: oneHotRaw('share'), action: 'share' })
    await h1({ type: 'flush' })
    expect(store.data?.examples).toBe(5)

    const h2 = createHandler(store)
    const r = await h2({ type: 'init', raw: oneHotRaw('nav-home') })
    expect(r.type === 'snapshot' && r.source).toBe('idb')
    expect(r.type === 'snapshot' && r.snapshot.stats.examples).toBe(5)

    const frag = await h2({ type: 'exportFragment' })
    const h3 = createHandler(memoryStore())
    const r3 = await h3({ type: 'init', raw: oneHotRaw('nav-home'), fragment: frag.type === 'fragment' ? frag.fragment : '' })
    expect(r3.type === 'snapshot' && r3.source).toBe('fragment')
    expect(r3.type === 'snapshot' && r3.snapshot.stats.examples).toBe(5)

    const bad = await createHandler(memoryStore())({ type: 'init', raw: oneHotRaw('nav-home'), fragment: '!!' })
    expect(bad.type === 'snapshot' && bad.source).toBe('fragment-error')

    const reset = await h2({ type: 'reset', raw: oneHotRaw('nav-home') })
    expect(reset.type === 'snapshot' && reset.snapshot.stats.examples).toBe(0)
    expect(store.data).toBeUndefined()
    const prior = reset.type === 'snapshot' ? reset.snapshot.markov : new Float32Array()
    PRIOR.forEach((p, i) => expect(prior[i]).toBeCloseTo(p, 5))
  })

  it('ModelClient falls back to an in-thread engine without Worker', async () => {
    const c = new ModelClient({ forceLocal: true, store: memoryStore() })
    expect(c.kind).toBe('local')
    await c.init(Float32Array.from(oneHotRaw('nav-home')))
    const s = await c.step(Float32Array.from(oneHotRaw('search')), 'search')
    expect(s.stats.examples).toBe(1)
    expect(s.weights.W1.length).toBe(SHAPE.inputs * SHAPE.hidden)
    const m = await c.exportModel()
    expect(m.examples).toBe(1)
  })
})
