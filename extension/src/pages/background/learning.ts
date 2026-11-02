import type { SiteLearning } from "../../shared/learning";
import { LEARNING_KEY, decision, emptyLearning, itemKey, recordUse, suggest, suggestOrder } from "../../shared/learning";
import { RAW_MODEL_FEATURES } from "../../../../src/signals/features";
import type { SiteRanker } from "../../shared/page-ranker";
import { RANKERS_KEY, blendedScores, itemId, mergeCatalog, rankerFor } from "../../shared/page-ranker";
import type { PlanGroup } from "../../shared/plan";
import { validatePlan } from "../../shared/plan";
import type { TabSession } from "../../shared/types";
import { effectiveGroups, pickGroups, showLayout } from "./layout";
import { rememberPlan } from "./saved-plans";

// Learning is per site and off until the user turns it on; counts stay on this device.

// The learned order of a group is a group of its own, named after it.
export const orderLabel = (label: string) => `Your order: ${label}`;

const originOf = (session: TabSession) => session.lastOrigin ?? (session.url ? new URL(session.url).origin : undefined);

async function readAll(): Promise<Record<string, SiteLearning>> {
  const stored = await chrome.storage.local.get(LEARNING_KEY);
  return (stored[LEARNING_KEY] as Record<string, SiteLearning> | undefined) ?? {};
}

export async function readLearning(origin: string): Promise<SiteLearning> {
  const all = await readAll();
  return all[origin] ?? emptyLearning();
}

async function writeLearning(origin: string, learning: SiteLearning) {
  await chrome.storage.local.set({ [LEARNING_KEY]: { ...(await readAll()), [origin]: learning } });
}

async function readRankers(): Promise<Record<string, SiteRanker>> {
  const stored = await chrome.storage.local.get(RANKERS_KEY);
  return (stored[RANKERS_KEY] as Record<string, SiteRanker> | undefined) ?? {};
}

async function writeRanker(origin: string, ranker: SiteRanker) {
  await chrome.storage.local.set({ [RANKERS_KEY]: { ...(await readRankers()), [origin]: ranker } });
}

async function forgetRanker(origin: string) {
  const all = await readRankers();
  delete all[origin];
  await chrome.storage.local.set({ [RANKERS_KEY]: all });
}

// The groups whose items the model ranks: every group of the plan with a choice of items in it,
// whether the layout changed it or left it as it is. Hidden groups can't be clicked.
function rankedGroups(session: TabSession): Array<PlanGroup> {
  return effectiveGroups(session).filter(
    (group) => group.operation !== "hide-secondary" && !group.origin && group.members.length >= 2
  );
}

// One training step of the site's model on this click: its catalog follows this page's groups
// and items, growing the network where needed. Returns each on-page item's blended score.
async function train(
  origin: string,
  session: TabSession,
  learning: SiteLearning,
  label: string,
  key: string,
  features: Array<number>
): Promise<(group: string, key: string) => number> {
  const byId = new Map(session.scan!.nodes.map((node) => [node.id, node]));
  const page = {
    groups: rankedGroups(session).map((group) => ({
      id: group.label,
      items: [...new Set(group.members.flatMap((id) => (byId.get(id) ? [itemId(group.label, itemKey(byId.get(id)!, group))] : [])))],
    })),
  };
  const uses = (id: string) => {
    const [group, item] = id.split("\n");
    const counts = learning.groups[group];
    return counts?.uses[counts.items.indexOf(item)] ?? 0;
  };
  const groupUses = (group: string) => (learning.groups[group]?.uses ?? []).reduce((sum, count) => sum + count, 0);
  const rankers = await readRankers();
  const saved = rankers[origin];
  const catalog = mergeCatalog(saved?.catalog, page, uses, groupUses);
  const ranker = rankerFor(catalog, saved);
  const id = itemId(label, key);
  // A press without pointer data (keyboard) still counts, with neutral features.
  const press = features.length === RAW_MODEL_FEATURES ? Float32Array.from(features) : new Float32Array(RAW_MODEL_FEATURES);
  if (ranker.index.ids.includes(id)) ranker.step(press, id, "open", label, Date.now());
  await writeRanker(origin, { catalog, model: ranker.toPersisted() });
  const scores = blendedScores(ranker);
  return (group, item) => scores.get(itemId(group, item)) ?? 0;
}

// A real click on an item of a kept layout. Returns the session with a suggestion when one item
// now clearly leads its group, or undefined when nothing changed for the panel.
export async function recordActivation(
  session: TabSession,
  label: string,
  nodeId: string,
  features: Array<number>
): Promise<TabSession | undefined> {
  const origin = originOf(session);
  const scan = session.scan;
  if (!origin || !scan || session.layout?.state !== "applied") return undefined;
  const learning = await readLearning(origin);
  if (!learning.enabled) return undefined;

  const group = effectiveGroups(session).find((candidate) => candidate.label === label);
  const byId = new Map(scan.nodes.map((node) => [node.id, node]));
  const node = byId.get(nodeId);
  if (!group || !node) return undefined;
  const key = itemKey(node, group);
  const next: SiteLearning = { ...learning, groups: { ...learning.groups, [label]: recordUse(learning.groups[label], key) } };
  await writeLearning(origin, next);
  const score = await train(origin, session, next, label, key, features);

  if (session.suggestion) return undefined;
  const members = group.members.flatMap((id) => {
    const member = byId.get(id);
    return member ? [{ node: member, key: itemKey(member, group) }] : [];
  });
  // A row the page can rearrange gets a whole order once there are enough clicks; until then, and
  // anywhere else, its one favourite can be brought forward.
  if (session.proposal?.orderable?.[label]?.ok) {
    const current = effectiveGroups(session).find((candidate) => candidate.label === orderLabel(label))?.orderKeys;
    const order = suggestOrder(next, group, members, (item) => score(label, item), current);
    if (order) return { ...session, suggestion: { ...order, nodeId: group.container, scannedAt: scan.scannedAt }, updatedAt: Date.now() };
  }
  const offer = suggest(next, group, members, (item) => score(label, item));
  const target = offer && members.find((member) => member.key === offer.item);
  if (!offer || !target) return undefined;
  return { ...session, suggestion: { ...offer, nodeId: target.node.id, scannedAt: scan.scannedAt }, updatedAt: Date.now() };
}

export async function setLearning(session: TabSession, change: "enable" | "disable" | "reset") {
  const origin = originOf(session);
  if (!origin) return;
  const learning = await readLearning(origin);
  await writeLearning(
    origin,
    change === "reset" ? { ...emptyLearning(), enabled: learning.enabled } : { ...learning, enabled: change === "enable" }
  );
  if (change === "reset") await forgetRanker(origin);
}

// Accepting emphasises the item on the page as a group of its own, saved with the plan so it comes
// back with it; either answer is remembered and the suggestion is not offered again.
export async function decide(session: TabSession, accept: boolean): Promise<TabSession> {
  const offer = session.suggestion;
  const origin = originOf(session);
  const scan = session.scan;
  const proposal = session.proposal;
  if (!offer || !origin || !scan || !proposal?.plan) return { ...session, suggestion: undefined };
  const learning = await readLearning(origin);
  await writeLearning(origin, { ...learning, decided: [...learning.decided, decision(offer.group, offer.item)] });

  const next: TabSession = { ...session, suggestion: undefined, updatedAt: Date.now() };
  if (!accept || offer.scannedAt !== scan.scannedAt) return next;

  if (offer.kind === "order") return acceptOrder(next, offer, scan);
  const name = offer.text.length > 40 ? `${offer.text.slice(0, 39)}…` : offer.text;
  const group: PlanGroup = {
    label: `You open most: ${name}`,
    urlPattern: proposal.plan.groups.find((candidate) => candidate.label === offer.group)?.urlPattern ?? proposal.plan.template.urlPattern,
    role: "other",
    container: offer.nodeId,
    members: [offer.nodeId],
    operation: "emphasize",
    reorderable: false,
    identity: { source: "none", attribute: "" },
    reason: `Learned: opened ${offer.uses} times`,
    origin: "learned",
  };
  if (validatePlan({ ...proposal.plan, groups: [group] }, scan).accepted.length === 0) return next;

  const plan = { ...proposal.plan, groups: [...proposal.plan.groups, group] };
  next.proposal = { ...proposal, plan, accepted: [...(proposal.accepted ?? []), group] };
  const labels = [...(session.layout?.labels ?? []), group.label];
  next.layout = await showLayout(next, pickGroups(next, labels), "applied");
  await rememberPlan({ ...plan, groups: next.proposal.accepted! }, scan, proposal.usedScreenshot);
  return next;
}

// Accepting an order: a "reorder" group over the same items, replacing an earlier order of that
// group, applied at once and saved with the plan (site-wide when its group is, like a nav bar).
async function acceptOrder(session: TabSession, offer: NonNullable<TabSession["suggestion"]>, scan: NonNullable<TabSession["scan"]>): Promise<TabSession> {
  const proposal = session.proposal!;
  const source = effectiveGroups(session).find((group) => group.label === offer.group);
  if (!source || !proposal.plan) return session;
  const label = orderLabel(offer.group);
  const group: PlanGroup = {
    ...source,
    label,
    operation: "reorder",
    reorderable: true,
    reason: `Learned from ${offer.uses} clicks`,
    rule: undefined,
    origin: "learned",
    orderKeys: offer.order,
  };
  if (validatePlan({ ...proposal.plan, groups: [group] }, scan).accepted.length === 0) return session;
  const others = (groups: Array<PlanGroup>) => groups.filter((other) => other.label !== label);
  const plan = { ...proposal.plan, groups: [...others(proposal.plan.groups), group] };
  const next: TabSession = { ...session, proposal: { ...proposal, plan, accepted: [...others(proposal.accepted ?? []), group] } };
  const labels = [...(session.layout?.labels ?? []).filter((name) => name !== label), label];
  next.layout = await showLayout(next, pickGroups(next, labels), "applied");
  await rememberPlan({ ...plan, groups: next.proposal!.accepted! }, scan, proposal.usedScreenshot);
  return next;
}
