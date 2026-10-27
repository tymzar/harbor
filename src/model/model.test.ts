import { afterEach, describe, expect, it, vi } from 'vitest'
import { CARDS, CARD_IDS, cardsOf, categoryMask, type CardId, type Category, type Verb } from '../cssnet/contract'
import { reorder, swapMargin } from '../app/adaptive'
import { Affinity } from './affinity'
import { BLEND_MAX, PRIOR, SHAPE, blendAlpha } from './config'
import { ModelEngine, argmaxIn, inTopK, validatePersisted } from './engine'
import { cloneWeights, forward, initWeights, sgdStep } from './mlp'
import { debouncedSaver, memoryStore } from './persist'
import { createHandler } from './protocol'
import { decodeFragment, encodeFragment, fragmentParam } from './quantize'
import { ModelClient } from './client'

const small = { inputs: 3, hidden: 4, outputs: 3 }
const L = Math.log1p
/** Model-feature vectors (9): press, approach, decel, straightness, tremor, hover, burst, todSin, todCos. */
const CALM = [L(380), 0.3, 0.35, 0.96, L(0.3), L(600), 1, 0, 1]
const RUSHED = [L(25), 2.2, -0.6, 0.55, L(3), L(8), 5, 0, 1]
const NEUTRAL = [L(100), 0.5, 0.2, 0.8, L(0.6), L(90), 1, 0, 1]
const idx = (id: CardId) => CARD_IDS.indexOf(id)

function engage(e: ModelEngine, seq: [CardId, Verb][], raw = NEUTRAL, t0 = 0, gap = 3000) {
  let t = t0
  for (const [card, verb] of seq) {
    const c = CARDS[idx(card)].category as Category
    e.step(raw, card, verb, c, (t += gap))
  }
  return t
}

describe('MLP with a category mask', () => {
  it('cold start is uniform inside the category and ~0 outside', () => {
    const w = initWeights(SHAPE, PRIOR)
    const { out } = forward(SHAPE, w, new Float32Array(SHAPE.inputs).fill(0.5), categoryMask('home'))
    CARDS.forEach((k, i) => (k.category === 'home' ? expect(out[i]).toBeCloseTo(1 / 6, 1) : expect(out[i]).toBeLessThan(1e-9)))
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
  })

  it('analytic gradient (with mask and sample weight) matches finite differences', () => {
    const w = initWeights(small, [0.3, 0.3, 0.4], 11)
    w.W2.forEach((_, i) => { w.W2[i] = Math.sin(i + 1) * 0.5 })
    const x = [0.4, -0.7, 1.1]
    const mask = [1, 0, 1]
    const label = 2
    const weight = 1.5
    const loss = (ww: typeof w) => -Math.log(forward(small, ww, x, mask).out[label])
    const lr = 1e-3
    const after = cloneWeights(w)
    sgdStep(small, after, x, label, { lr, l2: 0 }, mask, weight)
    for (const key of ['W1', 'b1', 'W2', 'b2'] as const) {
      for (let k = 0; k < w[key].length; k++) {
        const analytic = (w[key][k] - after[key][k]) / (lr * weight)
        const eps = 1e-3
        const plus = cloneWeights(w); plus[key][k] += eps
        const minus = cloneWeights(w); minus[key][k] -= eps
        expect(analytic).toBeCloseTo((loss(plus) - loss(minus)) / (2 * eps), 2)
      }
    }
  })
})

describe('Affinity', () => {
  it('normalises within each category and decays older engagement', () => {
    const a = new Affinity(0.9, 1)
    a.update(idx('drafts'), 1)
    a.update(idx('drafts'), 1)
    a.update(idx('team'), 1)
    const p = a.probs()
    for (const c of ['home', 'explore', 'library'] as Category[]) {
      expect(cardsOf(c).reduce((s, id) => s + p[idx(id)], 0)).toBeCloseTo(1, 6)
    }
    expect(p[idx('drafts')]).toBeGreaterThan(p[idx('team')])
    expect(p[idx('team')]).toBeGreaterThan(p[idx('briefing')])
    cardsOf('explore').forEach((id) => expect(p[idx(id)]).toBeCloseTo(1 / 6, 6))
  })
})

describe('reorder with hysteresis', () => {
  const scoresFor = (m: Partial<Record<CardId, number>>) => CARD_IDS.map((id) => m[id] ?? 0)
  it('re-sorts the whole category in one call when the evidence is clear', () => {
    const prev = cardsOf('home')
    const s = scoresFor({ notes: 0.4, inbox: 0.3, calendar: 0.2, team: 0.14, drafts: 0.08, briefing: 0.02 })
    expect(reorder(prev, s)).toEqual(['notes', 'inbox', 'calendar', 'team', 'drafts', 'briefing'])
  })
  it('keeps near-ties where they are', () => {
    const prev: CardId[] = ['drafts', 'team', 'briefing', 'calendar', 'inbox', 'notes']
    const s = scoresFor({ drafts: 0.2, team: 0.21, briefing: 0.15, calendar: 0.16, inbox: 0.14, notes: 0.14 })
    // the app's margin at ~10 presses of evidence: 0.01 + 0.6 / 11 ~ 0.065
    expect(reorder(prev, s, swapMargin(10))).toEqual(prev)
    expect(swapMargin(10)).toBeGreaterThan(0.05)
  })
})

describe('ModelEngine (per-category ranking)', () => {
  it('mostly drafts and team: the full Home order follows, other categories untouched', () => {
    const e = new ModelEngine(() => 0)
    e.predict(NEUTRAL, 'home')
    const seq: [CardId, Verb][] = []
    for (let k = 0; k < 6; k++) seq.push(['drafts', k % 2 ? 'share' : 'open'], ['team', 'open'])
    seq.push(['calendar', 'open'])
    engage(e, seq)
    const s = e.snapshot()
    const score = CARD_IDS.map((_, i) => (1 - s.alpha) * s.affinity[i] + s.alpha * s.mlp[i])
    const order = reorder(cardsOf('home'), score)
    expect(order.slice(0, 3)).toEqual(['drafts', 'team', 'calendar'])
    expect(s.evidence.explore).toBe(0)
    cardsOf('explore').forEach((id) => expect(s.affinity[idx(id)]).toBeCloseTo(1 / 6, 6))
    expect(s.stats.examples).toBe(13)
  })

  it('a rage burst (same card + verb inside the window) counts once; a different verb counts', () => {
    const e = new ModelEngine(() => 0)
    e.predict(NEUTRAL, 'home')
    for (let k = 0; k < 5; k++) e.step(RUSHED, 'inbox', 'open', 'home', 1000 + k * 120)
    expect(e.examples).toBe(1)
    e.step(NEUTRAL, 'inbox', 'share', 'home', 1700)
    expect(e.examples).toBe(2)
    e.step(NEUTRAL, 'inbox', 'share', 'home', 5000)
    expect(e.examples).toBe(3)
  })

  it('unfavorite slightly lowers the card, is not a use, and a quick re-favorite stays one favorite', () => {
    const e = new ModelEngine(() => 0)
    e.predict(NEUTRAL, 'home')
    e.step(NEUTRAL, 'notes', 'favorite', 'home', 1000)
    const after = e.snapshot()
    const un = e.step(NEUTRAL, 'notes', 'unfavorite', 'home', 1400)
    expect(un.lastEvent).toMatchObject({ verb: 'unfavorite', weight: -0.3, counted: true })
    expect(un.affinity[idx('notes')]).toBeLessThan(after.affinity[idx('notes')])
    expect(un.affinity[idx('notes')]).toBeGreaterThan(1 / 6) // lowered, not erased: the favorite still outweighs it
    expect(un.mlp[idx('notes')]).toBeLessThan(after.mlp[idx('notes')])
    expect(un.stats.examples).toBe(1)
    expect(un.evidence.home).toBeCloseTo(after.evidence.home - 0.3, 6)
    // favorite → unfavorite → favorite inside DEDUPE_MS: still one favorite.
    e.step(NEUTRAL, 'notes', 'favorite', 'home', 1800)
    expect(e.examples).toBe(1)
    // Heart spam: further toggles inside the window change nothing.
    const spam = e.step(NEUTRAL, 'notes', 'unfavorite', 'home', 2200)
    expect(spam.lastEvent).toMatchObject({ counted: false, weight: 0 })
    // A slow unfavorite/re-favorite counts both.
    e.step(NEUTRAL, 'notes', 'unfavorite', 'home', 6000)
    e.step(NEUTRAL, 'notes', 'favorite', 'home', 9000)
    expect(e.examples).toBe(2)
  })

  it('affinity never goes below zero', () => {
    const e = new ModelEngine(() => 0)
    e.predict(NEUTRAL, 'home')
    for (let k = 0; k < 4; k++) e.step(NEUTRAL, 'inbox', 'unfavorite', 'home', 1000 + k * 3000)
    expect(e.snapshot().affinity[idx('inbox')]).toBeGreaterThan(0)
    expect(e.snapshot().evidence.home).toBe(0)
  })

  it('learns that intensity changes the preferred card (MLP), where affinity alone cannot', () => {
    const e = new ModelEngine(() => 0)
    e.predict(NEUTRAL, 'library')
    let t = 0
    // Calm sessions read; rushed sessions grab a map. The running intensity carries the mood.
    // Blocks of 8: the context is a running average of earlier clicks, so it needs a few
    // clicks to reflect a change of mood; most examples in a block are then consistent.
    for (let r = 0; r < 24; r++) {
      const calm = r % 2 === 0
      for (let k = 0; k < 8; k++) e.step(calm ? CALM : RUSHED, calm ? 'reading' : 'maps', 'open', 'library', (t += 3000))
    }
    for (let k = 0; k < 6; k++) e.step(CALM, 'reading', 'open', 'library', (t += 3000))
    const afterCalm = e.snapshot().mlp
    for (let k = 0; k < 6; k++) e.step(RUSHED, 'maps', 'open', 'library', (t += 3000))
    const afterRushed = e.snapshot().mlp
    expect(afterCalm[idx('reading')]).toBeGreaterThan(afterCalm[idx('maps')])
    expect(afterRushed[idx('maps')]).toBeGreaterThan(afterRushed[idx('reading')])
  })

  it('hit rate counts the engaged card being in the top 3', () => {
    const p = CARD_IDS.map((_, i) => (i < 6 ? 6 - i : 0))
    expect(inTopK(p, 'home', 2)).toBe(true)
    expect(inTopK(p, 'home', 3)).toBe(false)
    expect(argmaxIn(p, 'home')).toBe(0)
  })

  it('round-trips through toPersisted/load (incl. orders) and rejects bad shapes', () => {
    const e = new ModelEngine(() => 0)
    e.predict(NEUTRAL, 'home')
    engage(e, [['drafts', 'open'], ['team', 'favorite'], ['moss', 'open']])
    e.setOrders({ home: ['team', 'drafts', 'briefing', 'calendar', 'inbox', 'notes'], explore: cardsOf('explore'), library: cardsOf('library') })
    const p = e.toPersisted()
    const e2 = new ModelEngine(() => 0)
    e2.load(JSON.parse(JSON.stringify(p)))
    expect(e2.predict(NEUTRAL, 'home').mlp).toEqual(e.predict(NEUTRAL, 'home').mlp)
    expect(e2.orders?.home[0]).toBe('team')
    expect(() => e2.load({ ...p, schemaVersion: 1 })).toThrow()
    expect(() => e2.load({ ...p, affinity: { counts: [1] } })).toThrow()
    expect(() => e2.load({ ...p, orders: { ...p.orders!, home: ['team'] } })).toThrow()
  })

  it('blend alpha starts at 0 and follows relative accuracy within bounds', () => {
    expect(blendAlpha(0, 0.5, 0.5)).toBe(0)
    expect(blendAlpha(100, 0.9, 0.1)).toBeCloseTo(0.1, 5)
    expect(blendAlpha(100, 0.1, 0.9)).toBeCloseTo(BLEND_MAX, 5)
    expect(blendAlpha(100, 0.5, 0.5)).toBeCloseTo(0.5, 5)
  })
})

describe('fragment quantisation', () => {
  it('round-trips within int8 precision, including orders', () => {
    const e = new ModelEngine()
    e.predict(NEUTRAL, 'home')
    engage(e, Array.from({ length: 30 }, (_, k) => [CARD_IDS[k % 18], 'open'] as [CardId, Verb]))
    e.setOrders({ home: ['notes', 'inbox', 'calendar', 'team', 'drafts', 'briefing'], explore: cardsOf('explore'), library: cardsOf('library') })
    const p = e.toPersisted()
    const frag = encodeFragment(p)
    expect(frag).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(frag.length).toBeLessThan(900)
    const d = decodeFragment(frag, p)
    validatePersisted(d)
    const maxAbs = Math.max(...p.weights.W1.map(Math.abs))
    p.weights.W1.forEach((v, i) => expect(Math.abs(v - d.weights.W1[i])).toBeLessThanOrEqual(maxAbs / 127 / 2 + 1e-6))
    expect(d.examples).toBe(p.examples)
    expect(d.orders).toEqual(p.orders)
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
    await h1({ type: 'init', raw: NEUTRAL, category: 'home' })
    for (let k = 0; k < 5; k++) await h1({ type: 'step', raw: NEUTRAL, card: 'drafts', verb: 'open', category: 'home', t: k * 5000 })
    await h1({ type: 'setOrders', orders: { home: ['drafts', 'briefing', 'team', 'calendar', 'inbox', 'notes'], explore: cardsOf('explore'), library: cardsOf('library') } })
    await h1({ type: 'flush' })
    expect(store.data?.examples).toBe(5)

    const h2 = createHandler(store)
    const r = await h2({ type: 'init', raw: NEUTRAL, category: 'home' })
    expect(r.type === 'snapshot' && r.source).toBe('idb')
    expect(r.type === 'snapshot' && r.snapshot.stats.examples).toBe(5)
    expect(r.type === 'snapshot' && r.snapshot.orders?.home[0]).toBe('drafts')

    const frag = await h2({ type: 'exportFragment' })
    const h3 = createHandler(memoryStore())
    const r3 = await h3({ type: 'init', raw: NEUTRAL, category: 'home', fragment: frag.type === 'fragment' ? frag.fragment : '' })
    expect(r3.type === 'snapshot' && r3.source).toBe('fragment')
    expect(r3.type === 'snapshot' && r3.snapshot.stats.examples).toBe(5)

    const bad = await createHandler(memoryStore())({ type: 'init', raw: NEUTRAL, category: 'home', fragment: '!!' })
    expect(bad.type === 'snapshot' && bad.source).toBe('fragment-error')

    const reset = await h2({ type: 'reset', raw: NEUTRAL, category: 'home' })
    expect(reset.type === 'snapshot' && reset.snapshot.stats.examples).toBe(0)
    expect(store.data).toBeUndefined()
    const aff = reset.type === 'snapshot' ? reset.snapshot.affinity : new Float32Array()
    aff.forEach((v) => expect(v).toBeCloseTo(1 / 6, 5))
  })

  it('ModelClient falls back to an in-thread engine without Worker', async () => {
    const c = new ModelClient({ forceLocal: true, store: memoryStore() })
    expect(c.kind).toBe('local')
    await c.init(Float32Array.from(NEUTRAL), 'home')
    const s = await c.step(Float32Array.from(NEUTRAL), 'notes', 'open', 'home', 1)
    expect(s.stats.examples).toBe(1)
    expect(s.weights.W1.length).toBe(SHAPE.inputs * SHAPE.hidden)
    expect((await c.exportModel()).examples).toBe(1)
  })
})
