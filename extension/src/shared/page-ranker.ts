// The pre-event neural ranker (src/model/ranker.ts, written 22-23 Oct 2026 for the Harbor app,
// reused as credited) plugged into whatever a page's plan contains. Its network has one input
// per group and one output per item, so its shape follows the page: a new group or item grows it.
// Growing keeps what was learned: weights of groups and items that still exist are copied over by
// name, new ones start from the ranker's own cold-start initialisation.
import { CatalogIndex, Ranker } from "../../../src/model/ranker";
import type { Catalog, RankerOptions } from "../../../src/model/ranker";
import { INIT_SEED } from "../../../src/model/config";
import { initWeights } from "../../../src/model/mlp";
import { POINTER_INPUTS } from "../../../src/signals/features";
import type { PersistedRanker } from "../../../src/model/ranker";

// One verb: the user opened an item. Weight scaled by hover deliberation, as in Harbor.
export const RANKER_OPTIONS: RankerOptions = {
  verbWeight: { open: 1 },
  pointerVerbs: new Set(["open"]),
  schemaVersion: 1,
};

// Bounds on what one site's model remembers; the least used go first.
export const MAX_GROUPS = 12;
export const MAX_ITEMS = 40;

// chrome.storage.local key: Record<origin, SiteRanker>.
export const RANKERS_KEY = "rankers";

export type SiteRanker = { catalog: Catalog; model: PersistedRanker };

// Item IDs must be unique across the catalog; the same text can appear in two groups.
export const itemId = (group: string, key: string) => `${group}\n${key}`;

type Usage = (id: string) => number;

// Keeps every current entry, then the most used others, up to the limit; order is preserved.
function trim<T>(entries: Array<T>, limit: number, current: (entry: T) => boolean, used: (entry: T) => number): Array<T> {
  if (entries.length <= limit) return entries;
  const room = Math.max(0, limit - entries.filter((entry) => current(entry)).length);
  const others = new Set(
    entries
      .filter((entry) => !current(entry))
      .toSorted((a, b) => used(b) - used(a))
      .slice(0, room)
  );
  return entries.filter((entry) => current(entry) || others.has(entry));
}

// The catalog after this page: everything remembered, plus this page's groups and items, trimmed
// to the bounds (this page's entries are always kept).
export function mergeCatalog(previous: Catalog | undefined, page: Catalog, usage: Usage, groupUsage: Usage): Catalog {
  const byGroup = new Map<string, Array<string>>();
  for (const group of [...(previous?.groups ?? []), ...page.groups])
    byGroup.set(group.id, [...new Set([...(byGroup.get(group.id) ?? []), ...group.items])]);
  const onPage = new Set(page.groups.map((group) => group.id));
  const pageItems = new Set(page.groups.flatMap((group) => group.items));
  const groups = trim([...byGroup.keys()], MAX_GROUPS, (id) => onPage.has(id), groupUsage);
  return {
    groups: groups
      .map((id) => ({ id, items: trim(byGroup.get(id)!, MAX_ITEMS, (item) => pageItems.has(item), usage) }))
      .filter((group) => group.items.length > 0),
  };
}

// A ranker for `catalog`, carrying over everything `saved` learned about groups and items that
// are still in it.
export function rankerFor(catalog: Catalog, saved?: SiteRanker): Ranker {
  const ranker = new Ranker(catalog, RANKER_OPTIONS);
  if (!saved) return ranker;
  const same = JSON.stringify(saved.catalog) === JSON.stringify(catalog);
  if (same) {
    ranker.load(saved.model);
    return ranker;
  }
  ranker.load(transfer(new CatalogIndex(saved.catalog), saved.model, ranker.index));
  return ranker;
}

function transfer(from: CatalogIndex, model: PersistedRanker, to: CatalogIndex): PersistedRanker {
  const { inputs: I0, hidden: H } = from.shape;
  const { inputs: I1, outputs: O1 } = to.shape;
  const fresh = initWeights(to.shape, to.prior, INIT_SEED);
  const W1 = [...fresh.W1];
  const W2 = [...fresh.W2];
  const b2 = [...fresh.b2];
  const shared = POINTER_INPUTS + 2;
  const oldGroup = (gi: number) => from.groupIds.indexOf(to.groupIds[gi]);
  const oldItem = (k: number) => from.ids.indexOf(to.ids[k]);

  for (let h = 0; h < H; h++) {
    for (let input = 0; input < shared; input++) W1[h * I1 + input] = model.weights.W1[h * I0 + input];
    for (let gi = 0; gi < to.groupIds.length; gi++) {
      const old = oldGroup(gi);
      if (old >= 0) W1[h * I1 + shared + gi] = model.weights.W1[h * I0 + shared + old];
    }
  }
  const counts = Array.from({ length: O1 }, () => 0);
  for (let k = 0; k < O1; k++) {
    const old = oldItem(k);
    if (old < 0) continue;
    for (let h = 0; h < H; h++) W2[k * H + h] = model.weights.W2[old * H + h];
    b2[k] = model.weights.b2[old];
    counts[k] = model.affinity.counts[old];
  }
  return {
    ...model,
    weights: { W1, b1: [...model.weights.b1], W2, b2 },
    affinity: { counts },
    // The ranker's saved orders (pre-event format) use null for "none yet".
    // eslint-disable-next-line unicorn/no-null
    orders: null,
    // eslint-disable-next-line unicorn/no-null
    navOrder: null,
    categoryCounts: to.groupIds.map((_, gi) => (oldGroup(gi) >= 0 ? (model.categoryCounts?.[oldGroup(gi)] ?? 0) : 0)),
  };
}

// The shown score per item: the ranker's own blend of the decaying count and the network,
// weighted by how accurate each has been.
export function blendedScores(ranker: Ranker): Map<string, number> {
  const snapshot = ranker.snapshot();
  const scores = new Map<string, number>();
  for (const [k, id] of ranker.index.ids.entries())
    scores.set(id, (1 - snapshot.alpha) * snapshot.affinity[k] + snapshot.alpha * snapshot.mlp[k]);
  return scores;
}
