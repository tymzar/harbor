import type { SiteLearning } from "../../shared/learning";
import { LEARNING_KEY, decision, emptyLearning, itemKey, recordUse, suggest } from "../../shared/learning";
import type { PlanGroup } from "../../shared/plan";
import { validatePlan } from "../../shared/plan";
import type { TabSession } from "../../shared/types";
import { effectiveGroups, pickGroups, showLayout } from "./layout";
import { rememberPlan } from "./saved-plans";

// Learning is per site and off until the user turns it on; counts stay on this device.

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

// A real click on an item of a kept layout. Returns the session with a suggestion when one item
// now clearly leads its group, or undefined when nothing changed for the panel.
export async function recordActivation(session: TabSession, label: string, nodeId: string): Promise<TabSession | undefined> {
  const origin = originOf(session);
  const scan = session.scan;
  if (!origin || !scan || session.layout?.state !== "applied") return undefined;
  const learning = await readLearning(origin);
  if (!learning.enabled) return undefined;

  const group = effectiveGroups(session).find((candidate) => candidate.label === label);
  const byId = new Map(scan.nodes.map((node) => [node.id, node]));
  const node = byId.get(nodeId);
  if (!group || !node) return undefined;
  const next: SiteLearning = { ...learning, groups: { ...learning.groups, [label]: recordUse(learning.groups[label], itemKey(node, group)) } };
  await writeLearning(origin, next);

  if (session.suggestion) return undefined;
  const members = group.members.flatMap((id) => {
    const member = byId.get(id);
    return member ? [{ node: member, key: itemKey(member, group) }] : [];
  });
  const offer = suggest(next, group, members);
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
