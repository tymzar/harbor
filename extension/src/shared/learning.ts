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

export type Suggestion = { group: string; item: string; text: string; uses: number };

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
export function suggest(
  learning: SiteLearning,
  group: PlanGroup,
  members: Array<{ node: ScanNode; key: string }>
): Suggestion | undefined {
  const counts = learning.groups[group.label];
  if (!counts || members.length < MIN_ITEMS || group.operation === "hide-secondary") return undefined;
  const onPage = members.map(({ node, key }) => {
    const index = counts.items.indexOf(key);
    return { node, key, weight: counts.counts[index] ?? 0, uses: counts.uses[index] ?? 0 };
  });
  const total = onPage.reduce((sum, entry) => sum + entry.weight, 0);
  const best = onPage.toSorted((a, b) => b.weight - a.weight)[0];
  if (!best || best.uses < MIN_USES || best.weight / total < MIN_SHARE) return undefined;
  if (learning.decided.includes(decision(group.label, best.key))) return undefined;
  return { group: group.label, item: best.key, text: best.node.text || best.key, uses: best.uses };
}

export const decision = (group: string, item: string) => `${group}\n${item}`;
