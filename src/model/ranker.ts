import type { NetShape, NetWeights } from '../cssnet/contract'
import { NORMALISE_MASK, NORM_PRIOR, POINTER_INPUTS, RAW_MODEL_FEATURES } from '../signals/features'
import { RunningNorm, type NormStats } from '../signals/normalizer'
import { RollingAccuracy } from './accuracy'
import { Affinity, type AffinityState } from './affinity'
import {
  ACC_WINDOW, AFFINITY_DECAY, AFFINITY_PRIOR, CARD_TO_CATEGORY, DEDUPE_MS, INIT_SEED, INTENSITY_EMA, SGD, blendAlpha,
} from './config'
import { cloneWeights, forward, initWeights, sgdStep } from './mlp'
import { deserialWeights, serialWeights, type ModelStats, type SerialWeights } from './types'

/**
 * A generic per-group ranker: any number of groups (Harbor: categories; the workspace: sidebar
 * sections, message actions, ...), each with its own items. One small MLP ranks every item; a
 * group's mask keeps its softmax to its own items. Same model as Harbor's: affinity backbone,
 * MLP on pointer intensity + time of day + group one-hot, accuracy-weighted blend, dedupe,
 * negative verbs, group-level usage for ordering the groups themselves.
 */

export interface Catalog {
  readonly groups: readonly { readonly id: string; readonly items: readonly string[] }[]
}

/** Everything derived from a catalog: flat item ids, group of each item, masks, network shape. */
export class CatalogIndex {
  readonly ids: readonly string[]
  readonly groupIds: readonly string[]
  readonly groupOf: readonly number[]
  readonly shape: NetShape
  /** Cold-start prior: uniform within each group. */
  readonly prior: readonly number[]
  private readonly masks: Float32Array[]
  readonly catalog: Catalog
  constructor(catalog: Catalog, hidden = 16) {
    this.catalog = catalog
    this.groupIds = catalog.groups.map((g) => g.id)
    this.ids = catalog.groups.flatMap((g) => g.items)
    if (new Set(this.ids).size !== this.ids.length) throw new Error('catalog: item ids must be unique')
    this.groupOf = catalog.groups.flatMap((g, gi) => g.items.map(() => gi))
    this.shape = { inputs: POINTER_INPUTS + 2 + catalog.groups.length, hidden, outputs: this.ids.length }
    this.prior = catalog.groups.flatMap((g) => g.items.map(() => 1 / g.items.length))
    this.masks = catalog.groups.map((_, gi) => Float32Array.from(this.groupOf, (g) => (g === gi ? 1 : 0)))
  }
  group(id: string): number {
    const g = this.groupIds.indexOf(id)
    if (g < 0) throw new Error(`unknown group ${id}`)
    return g
  }
  item(id: string): number {
    const k = this.ids.indexOf(id)
    if (k < 0) throw new Error(`unknown item ${id}`)
    return k
  }
  itemsOf(group: string): string[] { return [...this.catalog.groups[this.group(group)].items] }
  mask(group: string): Float32Array { return this.masks[this.group(group)] }
  defaultOrders(): Record<string, string[]> {
    return Object.fromEntries(this.catalog.groups.map((g) => [g.id, [...g.items]]))
  }
  /** Was `item` in the top k of its group by p? (the hit rate that matters for a sorted list) */
  inTopK(p: ArrayLike<number>, group: string, item: number, k = 3): boolean {
    const g = this.group(group)
    const ids = this.groupOf.map((x, i) => (x === g ? i : -1)).filter((i) => i >= 0)
    ids.sort((a, b) => p[b] - p[a] || a - b)
    return ids.slice(0, k).includes(item)
  }
}

export interface RankerOptions {
  /** Training weight per verb; negative verbs (an undo) slightly lower an item and are not a use. */
  verbWeight: Readonly<Record<string, number>>
  /** Verbs from a pointer press: their weight is scaled by hover deliberation. */
  pointerVerbs: ReadonlySet<string>
  schemaVersion: number
  hidden?: number
  seed?: number
}

export interface RankerEvent { item: string; verb: string; group: string; weight: number; counted: boolean; hit: boolean }

export interface RankerSnapshot {
  weights: NetWeights
  x: Float32Array
  group: string
  xByGroup: Record<string, number[]>
  affinity: Float32Array
  mlp: Float32Array
  evidence: Record<string, number>
  groupScores: number[]
  groupEvidence: number
  groupOrder: string[] | null
  alpha: number
  stats: ModelStats
  orders: Record<string, string[]> | null
  lastEvent: RankerEvent | null
  updatedAt: number
}

export interface PersistedRanker {
  schemaVersion: number
  weights: SerialWeights
  normStats: NormStats
  affinity: AffinityState
  intensity: number[]
  orders: Record<string, string[]> | null
  categoryCounts?: number[]
  navOrder?: string[] | null
  updatedAt: number
  examples: number
  acc?: { affinity: boolean[]; mlp: boolean[]; blend?: boolean[] }
}

const HOVER = 5 // index of hoverDwell in MODEL_FEATURES

export class Ranker {
  readonly index: CatalogIndex
  readonly opts: RankerOptions
  weights: NetWeights
  norm = new RunningNorm(RAW_MODEL_FEATURES, NORMALISE_MASK, NORM_PRIOR)
  affinity: Affinity
  accAffinity = new RollingAccuracy(ACC_WINDOW)
  accMlp = new RollingAccuracy(ACC_WINDOW)
  /** Hit rate of the blended score, i.e. of the order the user actually sees. */
  accBlend = new RollingAccuracy(ACC_WINDOW)
  /** Running pointer intensity in normalised units (0 = typical). */
  intensity = new Float32Array(POINTER_INPUTS)
  tod = new Float32Array(2)
  examples = 0
  updatedAt = 0
  orders: Record<string, string[]> | null = null
  /** Group-level usage (catalog order) and the group order last shown. */
  groupCounts: Float64Array
  groupOrder: string[] | null = null
  group: string
  private lastVisit: { g: string; t: number } | null = null
  private last: { item: number; verb: string; t: number } | null = null
  /** Dedupe for negative verbs, kept apart so they never reopen the window of the press they undo. */
  private lastNegative: { item: number; t: number } | null = null
  private readonly clock: () => number

  constructor(catalog: Catalog, opts: RankerOptions, clock: () => number = () => Date.now()) {
    this.index = new CatalogIndex(catalog, opts.hidden)
    this.opts = opts
    this.clock = clock
    this.weights = initWeights(this.index.shape, this.index.prior, opts.seed ?? INIT_SEED)
    this.affinity = new Affinity(AFFINITY_DECAY, AFFINITY_PRIOR, this.index.groupOf)
    this.groupCounts = new Float64Array(this.index.groupIds.length)
    this.group = this.index.groupIds[0]
  }

  get shape(): NetShape { return this.index.shape }

  reset(): void {
    this.weights = initWeights(this.index.shape, this.index.prior, this.opts.seed ?? INIT_SEED)
    this.norm.reset()
    this.affinity.reset()
    this.accAffinity.reset()
    this.accMlp.reset()
    this.accBlend.reset()
    this.intensity.fill(0)
    this.examples = 0
    this.orders = null
    this.groupCounts.fill(0)
    this.groupOrder = null
    this.lastVisit = null
    this.last = null
    this.lastNegative = null
    this.updatedAt = this.clock()
  }

  private bumpGroup(g: string, w: number) {
    for (let i = 0; i < this.groupCounts.length; i++) this.groupCounts[i] *= AFFINITY_DECAY
    this.groupCounts[this.index.group(g)] += w
  }

  /** The user opened a group: a group-level preference signal (repeats within DEDUPE_MS count once). */
  visit(raw: ArrayLike<number>, group: string, t: number): RankerSnapshot {
    this.observeTime(raw)
    const dup = !!this.lastVisit && this.lastVisit.g === group && t - this.lastVisit.t < DEDUPE_MS
    this.lastVisit = { g: group, t }
    if (!dup && this.group !== group) {
      const z = this.norm.apply(raw)
      this.bumpGroup(group, Math.max(0.7, Math.min(1.3, 1 + 0.15 * z[HOVER])))
    }
    this.group = group
    this.updatedAt = this.clock()
    return this.snapshot()
  }

  /** Network input for a group: running intensity, time of day, group one-hot. */
  context(group: string): Float32Array {
    const x = new Float32Array(this.index.shape.inputs)
    x.set(this.intensity, 0)
    x.set(this.tod, POINTER_INPUTS)
    x[POINTER_INPUTS + 2 + this.index.group(group)] = 1
    return x
  }

  private observeTime(raw: ArrayLike<number>) {
    this.tod[0] = raw[POINTER_INPUTS] ?? 0
    this.tod[1] = raw[POINTER_INPUTS + 1] ?? 0
  }

  /** No interaction (page load, group switch): just report the current scores. */
  predict(raw: ArrayLike<number>, group: string): RankerSnapshot {
    this.observeTime(raw)
    this.group = group
    return this.snapshot()
  }

  /**
   * The user engaged an item. Train on the context BEFORE this press (how they had been
   * clicking, in this group, at this time), weighted by verb and deliberation, then fold this
   * press's intensity into the running context. A repeat of the same item + verb within
   * DEDUPE_MS is not a new preference signal. A negative verb slightly lowers the item and is
   * not a use (no group credit, accuracy sample or example count), with its own dedupe slot.
   */
  step(raw: ArrayLike<number>, item: string, verb: string, group: string, t: number): RankerSnapshot {
    const k = this.index.item(item)
    const { shape } = this.index
    const vw = this.opts.verbWeight[verb]
    if (vw === undefined) throw new Error(`unknown verb ${verb}`)
    this.observeTime(raw)
    this.group = group
    let event: RankerEvent = { item, verb, group, weight: 0, counted: false, hit: false }
    const negative = vw < 0
    if (negative) {
      const dup = !!this.lastNegative && this.lastNegative.item === k && t - this.lastNegative.t < DEDUPE_MS
      this.lastNegative = { item: k, t }
      if (!dup) {
        // Gradient ascent on this item's loss, scaled small; no L2 term (a negative rate would grow weights).
        sgdStep(shape, this.weights, this.context(group), k, { ...SGD, l2: 0 }, this.index.mask(group), vw)
        this.affinity.lower(k, -vw)
        event = { ...event, weight: vw, counted: true }
      }
    }
    const dup = negative || (!!this.last && this.last.item === k && this.last.verb === verb && t - this.last.t < DEDUPE_MS)
    if (!negative) this.last = { item: k, verb, t }
    if (!dup) {
      const z = this.norm.apply(raw)
      const x = this.context(group)
      const mask = this.index.mask(group)
      const aff = this.affinity.probs()
      const mlp = forward(shape, this.weights, x, mask).out
      const alpha = blendAlpha(this.examples, this.accAffinity.value, this.accMlp.value)
      this.accAffinity.push(this.index.inTopK(aff, group, k))
      this.accMlp.push(this.index.inTopK(mlp, group, k))
      const hit = this.index.inTopK(aff.map((a, i) => (1 - alpha) * a + alpha * mlp[i]), group, k)
      this.accBlend.push(hit)
      const deliberate = this.opts.pointerVerbs.has(verb) ? Math.max(0.7, Math.min(1.3, 1 + 0.15 * z[HOVER])) : 1
      const w = vw * deliberate
      sgdStep(shape, this.weights, x, k, SGD, mask, w)
      this.affinity.update(k, w)
      this.bumpGroup(group, CARD_TO_CATEGORY * w)
      this.examples++
      event = { ...event, weight: w, counted: true, hit }
    }
    this.norm.update(raw)
    const z = this.norm.apply(raw)
    for (let i = 0; i < POINTER_INPUTS; i++) this.intensity[i] = (1 - INTENSITY_EMA) * this.intensity[i] + INTENSITY_EMA * z[i]
    this.updatedAt = this.clock()
    return { ...this.snapshot(), lastEvent: event }
  }

  setOrders(o: Record<string, string[]>, groupOrder?: string[] | null): void { this.orders = o; if (groupOrder) this.groupOrder = groupOrder }

  snapshot(): RankerSnapshot {
    const { shape, groupIds, groupOf } = this.index
    const mlp = new Float32Array(shape.outputs)
    const xByGroup: Record<string, number[]> = {}
    groupIds.forEach((g, gi) => {
      const x = this.context(g)
      xByGroup[g] = Array.from(x)
      const out = forward(shape, this.weights, x, this.index.mask(g)).out
      groupOf.forEach((og, i) => { if (og === gi) mlp[i] = out[i] })
    })
    const total = this.groupCounts.reduce((a, b) => a + b, 0)
    return {
      weights: cloneWeights(this.weights),
      x: Float32Array.from(xByGroup[this.group]),
      group: this.group,
      xByGroup,
      affinity: this.affinity.probs(),
      mlp,
      evidence: Object.fromEntries(groupIds.map((g, gi) => [g, groupOf.reduce((e, og, i) => e + (og === gi ? this.affinity.counts[i] : 0), 0)])),
      alpha: blendAlpha(this.examples, this.accAffinity.value, this.accMlp.value),
      stats: { examples: this.examples, affinityAcc: this.accAffinity.value, mlpAcc: this.accMlp.value, blendAcc: this.accBlend.value, accN: this.accMlp.size },
      orders: this.orders,
      groupScores: Array.from(this.groupCounts, (v) => (v + 1 / groupIds.length) / (total + 1)),
      groupEvidence: total,
      groupOrder: this.groupOrder,
      lastEvent: null,
      updatedAt: this.updatedAt,
    }
  }

  toPersisted(): PersistedRanker {
    return {
      schemaVersion: this.opts.schemaVersion,
      weights: serialWeights(this.weights),
      normStats: this.norm.toJSON(),
      affinity: this.affinity.toJSON(),
      intensity: Array.from(this.intensity),
      orders: this.orders,
      categoryCounts: Array.from(this.groupCounts),
      navOrder: this.groupOrder,
      updatedAt: this.updatedAt,
      examples: this.examples,
      acc: { affinity: this.accAffinity.toJSON(), mlp: this.accMlp.toJSON(), blend: this.accBlend.toJSON() },
    }
  }

  load(m: PersistedRanker): void {
    this.validate(m)
    this.weights = deserialWeights(m.weights)
    this.norm.load(m.normStats)
    this.affinity.load(m.affinity)
    this.intensity = Float32Array.from(m.intensity)
    this.orders = m.orders ?? null
    this.groupCounts = Float64Array.from(m.categoryCounts ?? this.index.groupIds.map(() => 0))
    this.groupOrder = m.navOrder ?? null
    this.examples = m.examples
    this.updatedAt = m.updatedAt
    this.accAffinity.load(m.acc?.affinity ?? [])
    this.accMlp.load(m.acc?.mlp ?? [])
    this.accBlend.load(m.acc?.blend ?? [])
    this.last = null
    this.lastNegative = null
  }

  /** Throws unless `m` is a saved model for exactly this catalog and schema. */
  validate(m: unknown): asserts m is PersistedRanker {
    validateFor(this.index, this.opts.schemaVersion, m)
  }
}

export function validateFor(index: CatalogIndex, schemaVersion: number, m: unknown): asserts m is PersistedRanker {
  const o = m as PersistedRanker
  if (!o || typeof o !== 'object') throw new Error('model: not an object')
  if (o.schemaVersion !== schemaVersion) throw new Error(`model: schemaVersion ${o.schemaVersion} != ${schemaVersion}`)
  const { inputs: I, hidden: H, outputs: O } = index.shape
  const w = o.weights
  if (!w || w.W1?.length !== H * I || w.b1?.length !== H || w.W2?.length !== O * H || w.b2?.length !== O) {
    throw new Error('model: weight shapes do not match')
  }
  if (!o.normStats || o.normStats.mean?.length !== RAW_MODEL_FEATURES) throw new Error('model: normStats shape')
  if (!o.affinity || o.affinity.counts?.length !== O) throw new Error('model: affinity shape')
  if (!Array.isArray(o.intensity) || o.intensity.length !== POINTER_INPUTS) throw new Error('model: intensity shape')
  if (o.orders) {
    for (const g of index.groupIds) {
      const ids = o.orders[g]
      const want = index.itemsOf(g).sort().join()
      if (!Array.isArray(ids) || [...ids].sort().join() !== want) throw new Error(`model: orders.${g} invalid`)
    }
  }
  if (o.categoryCounts && o.categoryCounts.length !== index.groupIds.length) throw new Error('model: categoryCounts shape')
  if (o.navOrder && [...o.navOrder].sort().join() !== [...index.groupIds].sort().join()) throw new Error('model: navOrder invalid')
  const all = [...w.W1, ...w.b1, ...w.W2, ...w.b2, ...o.normStats.mean, ...o.normStats.m2, ...o.affinity.counts, ...o.intensity]
  if (!all.every((v) => typeof v === 'number' && Number.isFinite(v))) throw new Error('model: non-finite values')
}
