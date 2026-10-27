import { CARDS, CARD_IDS, CATEGORIES, categoryMask, type CardId, type Category, type NetWeights, type Verb } from '../cssnet/contract'
import { NORMALISE_MASK, NORM_PRIOR, POINTER_INPUTS, RAW_MODEL_FEATURES } from '../signals/features'
import { RunningNorm } from '../signals/normalizer'
import { RollingAccuracy } from './accuracy'
import { Affinity } from './affinity'
import {
  ACC_WINDOW, AFFINITY_DECAY, AFFINITY_PRIOR, CARD_TO_CATEGORY, DEDUPE_MS, POINTER_VERBS, INIT_SEED, INTENSITY_EMA, PRIOR, SCHEMA_VERSION, SGD, SHAPE, VERB_WEIGHT, blendAlpha,
} from './config'
import { cloneWeights, forward, initWeights, sgdStep } from './mlp'
import { deserialWeights, serialWeights, type ModelEvent, type ModelSnapshot, type Orders, type PersistedModel } from './types'

const HOVER = 5 // index of hoverDwell in MODEL_FEATURES

/** Hit rate that matters for a sorted page: the engaged card was in the top `k` of its category. */
export const HIT_AT = 3
export function inTopK(p: ArrayLike<number>, c: Category, card: number, k = HIT_AT): boolean {
  const ids = CARDS.map((x, i) => ({ i, c: x.category })).filter((x) => x.c === c).map((x) => x.i)
  ids.sort((a, b) => p[b] - p[a] || a - b)
  return ids.slice(0, k).includes(card)
}

export function argmaxIn(p: ArrayLike<number>, c: Category): number {
  let best = -1
  CARDS.forEach((k, i) => { if (k.category === c && (best < 0 || p[i] > p[best])) best = i })
  return best
}

/** Pure model logic (no I/O). Runs inside the worker, or in-thread as a fallback. */
export class ModelEngine {
  weights: NetWeights
  norm = new RunningNorm(RAW_MODEL_FEATURES, NORMALISE_MASK, NORM_PRIOR)
  affinity = new Affinity(AFFINITY_DECAY, AFFINITY_PRIOR)
  accAffinity = new RollingAccuracy(ACC_WINDOW)
  accMlp = new RollingAccuracy(ACC_WINDOW)
  /** Hit rate of the blended score, i.e. of the order the user actually sees. */
  accBlend = new RollingAccuracy(ACC_WINDOW)
  /** Running pointer intensity in normalised units (0 = typical). */
  intensity = new Float32Array(POINTER_INPUTS)
  tod = new Float32Array(2)
  examples = 0
  updatedAt = 0
  orders: Orders | null = null
  /** Category-level usage (CATEGORIES order) and the category order last shown. */
  categoryCounts = new Float64Array(CATEGORIES.length)
  navOrder: Category[] | null = null
  private lastVisit: { c: Category; t: number } | null = null
  category: Category = 'home'
  private last: { card: number; verb: Verb; t: number } | null = null

  private readonly clock: () => number
  constructor(clock: () => number = () => Date.now()) {
    this.clock = clock
    this.weights = initWeights(SHAPE, PRIOR, INIT_SEED)
  }

  reset(): void {
    this.weights = initWeights(SHAPE, PRIOR, INIT_SEED)
    this.norm.reset()
    this.affinity.reset()
    this.accAffinity.reset()
    this.accMlp.reset()
    this.accBlend.reset()
    this.intensity.fill(0)
    this.examples = 0
    this.orders = null
    this.categoryCounts.fill(0)
    this.navOrder = null
    this.lastVisit = null
    this.last = null
    this.updatedAt = this.clock()
  }

  private bumpCategory(c: Category, w: number) {
    for (let i = 0; i < this.categoryCounts.length; i++) this.categoryCounts[i] *= AFFINITY_DECAY
    this.categoryCounts[CATEGORIES.indexOf(c)] += w
  }

  /** The user opened a category: a category-level preference signal (repeats within DEDUPE_MS count once). */
  visit(raw: ArrayLike<number>, category: Category, t: number): ModelSnapshot {
    this.observeTime(raw)
    const dup = !!this.lastVisit && this.lastVisit.c === category && t - this.lastVisit.t < DEDUPE_MS
    this.lastVisit = { c: category, t }
    if (!dup && this.category !== category) {
      const z = this.norm.apply(raw)
      this.bumpCategory(category, Math.max(0.7, Math.min(1.3, 1 + 0.15 * z[HOVER])))
    }
    this.category = category
    this.updatedAt = this.clock()
    return this.snapshot()
  }

  /** Network input for a category: running intensity, time of day, category one-hot. */
  context(c: Category): Float32Array {
    const x = new Float32Array(SHAPE.inputs)
    x.set(this.intensity, 0)
    x.set(this.tod, POINTER_INPUTS)
    x[POINTER_INPUTS + 2 + CATEGORIES.indexOf(c)] = 1
    return x
  }

  private observeTime(raw: ArrayLike<number>) {
    this.tod[0] = raw[POINTER_INPUTS] ?? 0
    this.tod[1] = raw[POINTER_INPUTS + 1] ?? 0
  }

  /** No interaction (page load, category switch): just report the current scores. */
  predict(raw: ArrayLike<number>, category: Category): ModelSnapshot {
    this.observeTime(raw)
    this.category = category
    return this.snapshot()
  }

  /**
   * The user engaged a card. Train on the context BEFORE this click (how they had been
   * clicking, in this category, at this time), weighted by verb and deliberation. Then fold
   * this click's intensity into the running context. A repeat press on the same card within
   * DEDUPE_MS with the same verb is not a new preference signal (rage bursts collapse to one event).
   */
  step(raw: ArrayLike<number>, card: CardId, verb: Verb, category: Category, t: number): ModelSnapshot {
    const k = CARD_IDS.indexOf(card)
    if (k < 0) throw new Error(`unknown card ${card}`)
    this.observeTime(raw)
    this.category = category
    const dup = !!this.last && this.last.card === k && this.last.verb === verb && t - this.last.t < DEDUPE_MS
    this.last = { card: k, verb, t }
    let event: ModelEvent = { card, verb, category, weight: 0, counted: false, hit: false }
    if (!dup) {
      const z = this.norm.apply(raw)
      const x = this.context(category)
      const mask = categoryMask(category)
      const aff = this.affinity.probs()
      const mlp = forward(SHAPE, this.weights, x, mask).out
      const alpha = blendAlpha(this.examples, this.accAffinity.value, this.accMlp.value)
      this.accAffinity.push(inTopK(aff, category, k))
      this.accMlp.push(inTopK(mlp, category, k))
      const hit = inTopK(aff.map((a, i) => (1 - alpha) * a + alpha * mlp[i]), category, k)
      this.accBlend.push(hit)
      const deliberate = POINTER_VERBS.has(verb) ? Math.max(0.7, Math.min(1.3, 1 + 0.15 * z[HOVER])) : 1
      const w = VERB_WEIGHT[verb] * deliberate
      sgdStep(SHAPE, this.weights, x, k, SGD, mask, w)
      this.affinity.update(k, w)
      this.bumpCategory(category, CARD_TO_CATEGORY * w)
      this.examples++
      event = { ...event, weight: w, counted: true, hit }
    }
    this.norm.update(raw)
    const z = this.norm.apply(raw)
    for (let i = 0; i < POINTER_INPUTS; i++) this.intensity[i] = (1 - INTENSITY_EMA) * this.intensity[i] + INTENSITY_EMA * z[i]
    this.updatedAt = this.clock()
    return { ...this.snapshot(), lastEvent: event }
  }

  setOrders(o: Orders, nav?: Category[] | null): void { this.orders = o; if (nav) this.navOrder = nav }

  snapshot(): ModelSnapshot {
    const mlp = new Float32Array(SHAPE.outputs)
    const xByCategory = {} as Record<Category, number[]>
    for (const c of CATEGORIES) {
      const x = this.context(c)
      xByCategory[c] = Array.from(x)
      const out = forward(SHAPE, this.weights, x, categoryMask(c)).out
      CARDS.forEach((k, i) => { if (k.category === c) mlp[i] = out[i] })
    }
    return {
      weights: cloneWeights(this.weights),
      x: Float32Array.from(xByCategory[this.category]),
      category: this.category,
      xByCategory,
      affinity: this.affinity.probs(),
      mlp,
      evidence: Object.fromEntries(CATEGORIES.map((c) => [c, CARDS.reduce((e, k, i) => e + (k.category === c ? this.affinity.counts[i] : 0), 0)])) as Record<Category, number>,
      alpha: blendAlpha(this.examples, this.accAffinity.value, this.accMlp.value),
      stats: { examples: this.examples, affinityAcc: this.accAffinity.value, mlpAcc: this.accMlp.value, blendAcc: this.accBlend.value, accN: this.accMlp.size },
      orders: this.orders,
      categoryScores: (() => { const sum = this.categoryCounts.reduce((a, b) => a + b, 0) + 1; return Array.from(this.categoryCounts, (v) => (v + 1 / 3) / sum) })(),
      categoryEvidence: this.categoryCounts.reduce((a, b) => a + b, 0),
      navOrder: this.navOrder,
      lastEvent: null,
      updatedAt: this.updatedAt,
    }
  }

  toPersisted(): PersistedModel {
    return {
      schemaVersion: SCHEMA_VERSION,
      weights: serialWeights(this.weights),
      normStats: this.norm.toJSON(),
      affinity: this.affinity.toJSON(),
      intensity: Array.from(this.intensity),
      orders: this.orders,
      categoryCounts: Array.from(this.categoryCounts),
      navOrder: this.navOrder,
      updatedAt: this.updatedAt,
      examples: this.examples,
      acc: { affinity: this.accAffinity.toJSON(), mlp: this.accMlp.toJSON(), blend: this.accBlend.toJSON() },
    }
  }

  load(m: PersistedModel): void {
    validatePersisted(m)
    this.weights = deserialWeights(m.weights)
    this.norm.load(m.normStats)
    this.affinity.load(m.affinity)
    this.intensity = Float32Array.from(m.intensity)
    this.orders = m.orders ?? null
    this.categoryCounts = Float64Array.from(m.categoryCounts ?? [0, 0, 0])
    this.navOrder = m.navOrder ?? null
    this.examples = m.examples
    this.updatedAt = m.updatedAt
    this.accAffinity.load(m.acc?.affinity ?? [])
    this.accMlp.load(m.acc?.mlp ?? [])
    this.accBlend.load(m.acc?.blend ?? [])
    this.last = null
  }
}

export function validatePersisted(m: unknown): asserts m is PersistedModel {
  const o = m as PersistedModel
  if (!o || typeof o !== 'object') throw new Error('model: not an object')
  if (o.schemaVersion !== SCHEMA_VERSION) throw new Error(`model: schemaVersion ${o.schemaVersion} != ${SCHEMA_VERSION}`)
  const { inputs: I, hidden: H, outputs: O } = SHAPE
  const w = o.weights
  if (!w || w.W1?.length !== H * I || w.b1?.length !== H || w.W2?.length !== O * H || w.b2?.length !== O) {
    throw new Error('model: weight shapes do not match')
  }
  if (!o.normStats || o.normStats.mean?.length !== RAW_MODEL_FEATURES) throw new Error('model: normStats shape')
  if (!o.affinity || o.affinity.counts?.length !== O) throw new Error('model: affinity shape')
  if (!Array.isArray(o.intensity) || o.intensity.length !== POINTER_INPUTS) throw new Error('model: intensity shape')
  if (o.orders) {
    for (const c of CATEGORIES) {
      const ids = o.orders[c]
      const want = CARDS.filter((k) => k.category === c).map((k) => k.id as string).sort().join()
      if (!Array.isArray(ids) || [...ids].sort().join() !== want) throw new Error(`model: orders.${c} invalid`)
    }
  }
  if (o.categoryCounts && o.categoryCounts.length !== CATEGORIES.length) throw new Error('model: categoryCounts shape')
  if (o.navOrder && [...o.navOrder].sort().join() !== [...CATEGORIES].sort().join()) throw new Error('model: navOrder invalid')
  const all = [...w.W1, ...w.b1, ...w.W2, ...w.b2, ...o.normStats.mean, ...o.normStats.m2, ...o.affinity.counts, ...o.intensity]
  if (!all.every((v) => typeof v === 'number' && Number.isFinite(v))) throw new Error('model: non-finite values')
}
