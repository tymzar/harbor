import { CARDS, CATEGORIES, type CardId, type Category, type Verb } from '../cssnet/contract'
import { POINTER_VERBS, SCHEMA_VERSION, VERB_WEIGHT } from './config'
import { CatalogIndex, Ranker, validateFor, type Catalog, type RankerSnapshot } from './ranker'
import type { ModelSnapshot, Orders, PersistedModel } from './types'

/** Harbor's catalog: three categories of six cards, in contract order (output index = CARDS index). */
export const HARBOR_CATALOG: Catalog = {
  groups: CATEGORIES.map((c) => ({ id: c, items: CARDS.filter((k) => k.category === c).map((k) => k.id) })),
}
const HARBOR = new CatalogIndex(HARBOR_CATALOG)
if (HARBOR.ids.join() !== CARDS.map((k) => k.id).join()) throw new Error('engine: catalog order must match CARDS')

/** Hit rate that matters for a sorted page: the engaged card was in the top `k` of its category. */
export const HIT_AT = 3
export const inTopK = (p: ArrayLike<number>, c: Category, card: number, k = HIT_AT): boolean => HARBOR.inTopK(p, c, card, k)

export function argmaxIn(p: ArrayLike<number>, c: Category): number {
  let best = -1
  CARDS.forEach((k, i) => { if (k.category === c && (best < 0 || p[i] > p[best])) best = i })
  return best
}

/** Harbor's view of a ranker snapshot (category / card names). */
function toModelSnapshot(s: RankerSnapshot): ModelSnapshot {
  return {
    weights: s.weights, x: s.x, category: s.group as Category, xByCategory: s.xByGroup as Record<Category, number[]>,
    affinity: s.affinity, mlp: s.mlp, evidence: s.evidence as Record<Category, number>,
    categoryScores: s.groupScores, categoryEvidence: s.groupEvidence, navOrder: s.groupOrder as Category[] | null,
    alpha: s.alpha, stats: s.stats, orders: s.orders as ModelSnapshot['orders'], updatedAt: s.updatedAt,
    lastEvent: s.lastEvent && { card: s.lastEvent.item as CardId, verb: s.lastEvent.verb as Verb, category: s.lastEvent.group as Category, weight: s.lastEvent.weight, counted: s.lastEvent.counted, hit: s.lastEvent.hit },
  }
}

/** Harbor's model: the generic Ranker over HARBOR_CATALOG. Runs inside the worker, or in-thread as a fallback. */
export class ModelEngine {
  readonly ranker: Ranker
  constructor(clock: () => number = () => Date.now()) {
    this.ranker = new Ranker(HARBOR_CATALOG, { verbWeight: VERB_WEIGHT, pointerVerbs: POINTER_VERBS, schemaVersion: SCHEMA_VERSION }, clock)
  }
  get examples(): number { return this.ranker.examples }
  get orders(): Orders | null { return this.ranker.orders as Orders | null }
  reset(): void { this.ranker.reset() }
  visit(raw: ArrayLike<number>, category: Category, t: number): ModelSnapshot { return toModelSnapshot(this.ranker.visit(raw, category, t)) }
  predict(raw: ArrayLike<number>, category: Category): ModelSnapshot { return toModelSnapshot(this.ranker.predict(raw, category)) }
  step(raw: ArrayLike<number>, card: CardId, verb: Verb, category: Category, t: number): ModelSnapshot {
    return toModelSnapshot(this.ranker.step(raw, card, verb, category, t))
  }
  setOrders(o: Orders, nav?: Category[] | null): void { this.ranker.setOrders(o, nav) }
  snapshot(): ModelSnapshot { return toModelSnapshot(this.ranker.snapshot()) }
  toPersisted(): PersistedModel { return this.ranker.toPersisted() as PersistedModel }
  load(m: PersistedModel): void { this.ranker.load(m) }
}

export function validatePersisted(m: unknown): asserts m is PersistedModel {
  validateFor(HARBOR, SCHEMA_VERSION, m)
}
