// Learning from use: which items of a kept layout the user actually opens, counted on this device
// only, per site. When one item clearly leads its group, the panel suggests emphasising it; the
// change happens only if the user accepts. Counting reuses the pre-event preference backbone
// (src/model/affinity.ts, written 22-23 Oct 2026 for the Harbor app): a decaying engagement count.
import { Affinity } from "../../../src/model/affinity";
import type { PlanGroup } from "./plan";
import type { ScanNode } from "./types";

// chrome.storage.local key: Record<origin, SiteLearning>.
export const LEARNING_KEY = "learning";

// Older uses count a little less with each new use in the same group.
const DECAY = 0.97;
// A suggestion needs this many uses of the item, and it must hold this share of its group.
export const MIN_USES = 3;
const MIN_SHARE = 0.5;
// Groups of one or two items have no favourite worth pointing out.
const MIN_ITEMS = 3;

// counts: decayed, for which item leads now; uses: plain totals, for "used at least MIN_USES times".
export type GroupCounts = { items: Array<string>; counts: Array<number>; uses: Array<number> };

export type SiteLearning = {
  enabled: boolean;
  // Per group label: the items seen used, and their decayed counts.
  groups: Record<string, GroupCounts>;
  // Suggestions accepted or turned down ("label\nitem"), never offered again.
  decided: Array<string>;
};

// kind "first" (the default) moves one item forward; "order" puts the whole row in order, item keys
// first to last in `order`, with `item` a key for the decision ("order:a|b|c").
export type Suggestion = { kind?: "first" | "order"; group: string; item: string; text: string; uses: number; order?: Array<string> };

export const emptyLearning = (): SiteLearning => ({ enabled: false, groups: {}, decided: [] });

const stableText = (text: string) => text.replaceAll(/\d+/g, "").replaceAll(/\s+/g, " ").trim();

// How an item is recognised on the next visit, when its node ID is new: the group's identity when
// it has one (a tab's data attribute, a link's path), else its text without counters.
export function itemKey(node: ScanNode, group: PlanGroup): string {
  const { source, attribute } = group.identity;
  if (source === "attribute" && node.attrs?.[attribute]) return `${attribute}=${node.attrs[attribute]}`;
  if (source === "href" && node.href) return node.href;
  return stableText(node.text) || node.href || node.id;
}

// One deliberate use of an item. Returns the updated counts for its group.
export function recordUse(counts: GroupCounts | undefined, item: string): GroupCounts {
  const items = [...(counts?.items ?? [])];
  const previous = [...(counts?.counts ?? [])];
  const uses = [...(counts?.uses ?? [])];
  if (!items.includes(item)) {
    items.push(item);
    previous.push(0);
    uses.push(0);
  }
  const index = items.indexOf(item);
  const affinity = new Affinity(DECAY, 1, items.map(() => 0));
  affinity.load({ counts: previous });
  affinity.update(index, 1);
  uses[index] += 1;
  return { items, counts: [...affinity.counts], uses };
}

// The item worth suggesting in this group, if one clearly leads among the items on the page.
// score ranks the items (the learning model's blended score); without it, the decayed counts do.
export function suggest(
  learning: SiteLearning,
  group: PlanGroup,
  members: Array<{ node: ScanNode; key: string }>,
  score?: (key: string) => number
): Suggestion | undefined {
  const counts = learning.groups[group.label];
  if (!counts || members.length < MIN_ITEMS || group.operation === "hide-secondary") return undefined;
  const onPage = members.map(({ node, key }) => {
    const index = counts.items.indexOf(key);
    return { node, key, weight: score ? score(key) : (counts.counts[index] ?? 0), uses: counts.uses[index] ?? 0 };
  });
  const total = onPage.reduce((sum, entry) => sum + entry.weight, 0);
  const best = onPage.toSorted((a, b) => b.weight - a.weight)[0];
  if (!best || best.uses < MIN_USES || best.weight / total < MIN_SHARE) return undefined;
  if (learning.decided.includes(decision(group.label, best.key))) return undefined;
  return { group: group.label, item: best.key, text: best.node.text || best.key, uses: best.uses };
}

export const decision = (group: string, item: string) => `${group}\n${item}`;

// A whole order for a row the page can rearrange (see checkOrder): offered once the group has had
// ORDER_MIN_USES clicks, with the items used so far ranked by score (the learning model's blended
// score; the decayed counts without it) and the unused ones after them in page order. Nothing is
// offered when that is the page's own order, the order already in place, or one the user decided on.
export const ORDER_MIN_USES = 8;

export const groupUses = (learning: SiteLearning, label: string) => (learning.groups[label]?.uses ?? []).reduce((sum, count) => sum + count, 0);

export function suggestOrder(
  learning: SiteLearning,
  group: PlanGroup,
  members: Array<{ node: ScanNode; key: string }>,
  score?: (key: string) => number,
  current?: Array<string>
): Suggestion | undefined {
  const counts = learning.groups[group.label];
  const keys = [...new Set(members.map((member) => member.key))];
  if (!counts || keys.length < MIN_ITEMS || groupUses(learning, group.label) < ORDER_MIN_USES) return undefined;
  const at = (key: string) => counts.items.indexOf(key);
  const used = (key: string) => counts.uses[at(key)] ?? 0;
  const weight = (key: string) => (score ? score(key) : (counts.counts[at(key)] ?? 0));
  const ranked = keys.filter((key) => used(key) > 0).toSorted((a, b) => weight(b) - weight(a));
  const order = [...ranked, ...keys.filter((key) => used(key) === 0)];
  const same = (other: Array<string>) => order.every((key, index) => key === other[index]);
  if (same(keys) || (current && same(current))) return undefined;
  const item = `order:${order.join("|")}`;
  if (learning.decided.includes(decision(group.label, item))) return undefined;
  const text = order.map((key) => members.find((member) => member.key === key)?.node.text || key).join(" · ");
  return { kind: "order", group: group.label, item, text, uses: groupUses(learning, group.label), order };
}
