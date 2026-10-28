import { pageKey } from "../../shared/cache";
import type { LayoutPlan, PlanGroup } from "../../shared/plan";
import { validatePlan } from "../../shared/plan";
import type { Proposal, TabSession } from "../../shared/types";
import { pickGroups, showLayout } from "./layout";
import { rememberAnswers, rememberPlan } from "./saved-plans";

// The plan pattern for a page with no plan yet: this page only.
const thisPage = (url: string) => pageKey(url).replace(/^https?:\/\//, "");

function emptyProposal(session: TabSession): Proposal {
  const now = Date.now();
  const urlPattern = thisPage(session.scan!.url);
  return {
    status: "done",
    scannedAt: session.scan!.scannedAt,
    usedScreenshot: false,
    calls: [],
    plan: { summary: "Your changes", template: { urlPattern, pageKind: "" }, groups: [], questions: [] },
    accepted: [],
    errors: [],
    repaired: false,
    startedAt: now,
    finishedAt: now,
  };
}

// Adds a "Hidden by you" group for one scanned element, hides it on the page and saves it with
// the plan, so it comes back wherever the plan does. Returns the updated session.
export async function hideNode(session: TabSession, nodeId: string): Promise<TabSession> {
  const scan = session.scan;
  const node = scan?.nodes.find((candidate) => candidate.id === nodeId);
  if (!scan || !node || node.sensitive) return session;

  const current = session.proposal?.status === "done" && session.proposal.scannedAt === scan.scannedAt;
  const proposal = current ? session.proposal! : emptyProposal(session);
  const plan = proposal.plan!;
  const accepted = proposal.accepted ?? [];
  if (accepted.some((group) => group.origin === "user" && group.container === nodeId)) return session;

  const name = node.text || node.attrs?.["aria-label"] || node.tag;
  const base = `Hidden by you: ${name.length > 40 ? `${name.slice(0, 39)}…` : name}`;
  const taken = new Set(plan.groups.map((group) => group.label));
  let label = base;
  for (let index = 2; taken.has(label); index += 1) label = `${base} (${index})`;

  const group: PlanGroup = {
    label,
    // Same reach as the plan: a hide made on one repo applies wherever the plan applies.
    urlPattern: plan.template.urlPattern,
    role: "other",
    container: nodeId,
    members: [nodeId],
    operation: "hide-secondary",
    reorderable: false,
    identity: { source: "none", attribute: "" },
    reason: "Hidden by you",
    origin: "user",
  };
  const nextPlan: LayoutPlan = { ...plan, groups: [...plan.groups, group] };
  if (validatePlan({ ...nextPlan, groups: [group] }, scan).accepted.length === 0) return session;

  const next: TabSession = {
    ...session,
    proposal: { ...proposal, plan: nextPlan, accepted: [...accepted, group] },
    updatedAt: Date.now(),
  };
  const labels = [...(session.layout?.labels ?? []), label];
  next.layout = await showLayout(next, pickGroups(next, labels), session.layout?.state ?? "applied");

  await rememberPlan({ ...nextPlan, groups: next.proposal!.accepted! }, scan, proposal.usedScreenshot);
  if (proposal.answers) await rememberAnswers(scan.url, proposal.answers);
  return next;
}

// Groups the user made, carried into a new plan for the same scan so asking Meta again keeps them.
export function userGroups(session: TabSession | undefined, scannedAt: number): Array<PlanGroup> {
  const proposal = session?.proposal;
  if (!proposal || proposal.scannedAt !== scannedAt) return [];
  return (proposal.accepted ?? []).filter((group) => group.origin === "user");
}
