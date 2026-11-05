import { LAYOUT_CSS } from "../../shared/layout-css";
import type { PlanGroup } from "../../shared/plan";
import { applyAnswers, usableQuestions } from "../../shared/questions";
import type { LayoutState, OrderCheck, TabSession } from "../../shared/types";

import type { LayoutGroup, LayoutResult } from "../content/apply";
import { itemKey } from "../../shared/learning";
import { rememberKept, rememberShapes, shapesFor } from "./saved-plans";

export const STALE_SCAN = "The page changed since Harbor read it. Rescan, then try again.";

// Where Harbor reads and changes a tab: its top frame, or the frame the scan chose (see
// contentFrame in index.ts). A session is one.
export type PageTarget = { tabId: number; frameId?: number };
export const pageTarget = ({ tabId, frameId }: PageTarget): chrome.scripting.InjectionTarget =>
  frameId ? { tabId, frameIds: [frameId] } : { tabId };

async function removeSheet(target: PageTarget) {
  await chrome.scripting.removeCSS({ target: pageTarget(target), css: LAYOUT_CSS }).catch(() => {});
}

// Puts the chosen groups on the page. Returns the new layout state for the session.
// The page refuses IDs from another scan; that surfaces here as an error instead of wrong marks.
export async function showLayout(
  session: TabSession,
  groups: Array<PlanGroup>,
  state: LayoutState["state"],
  // Off when re-applying what was already kept: a page missing a region mustn't shrink the saved choice.
  remember = true
): Promise<LayoutState | undefined> {
  const chosen = groups.filter((group) => group.operation !== "none");
  if (chosen.length === 0) return undefined;
  // Regions the plan leaves alone are still watched for clicks, so learning sees them
  // (the user's tabs are usually left as they are, and are what they open most).
  const watched = effectiveGroups(session).filter(
    (group) => group.operation === "none" && !chosen.some((other) => other.label === group.label)
  );

  await removeSheet(session);
  await chrome.scripting.insertCSS({ target: pageTarget(session), css: LAYOUT_CSS });
  const byId = new Map((session.scan?.nodes ?? []).map((node) => [node.id, node]));
  // A learned order's members, first to last: by their item keys; items it doesn't name go last.
  const ordered = (group: PlanGroup) => {
    const place = (id: string) => {
      const node = byId.get(id);
      const index = node ? (group.orderKeys ?? []).indexOf(itemKey(node, group)) : -1;
      return index === -1 ? Number.POSITIVE_INFINITY : index;
    };
    return group.members.toSorted((a, b) => place(a) - place(b));
  };
  const shapes = session.url ? await shapesFor(session.url) : {};
  const layout: Array<LayoutGroup> = [...chosen, ...watched].map((group) => ({
    label: group.label,
    container: group.container,
    members: group.operation === "reorder" ? ordered(group) : group.members,
    operation: group.operation,
    first: group.origin === "learned" && group.operation === "emphasize",
    shape: shapes[group.label],
  }));
  const [injection] = await chrome.scripting.executeScript({
    target: pageTarget(session),
    func: (groups: Array<LayoutGroup>, preview: boolean, scannedAt: number) =>
      globalThis.smartWeb!.apply(groups, preview, scannedAt),
    args: [layout, state === "preview", session.scan?.scannedAt ?? 0] as [Array<LayoutGroup>, boolean, number],
  });
  const result = injection?.result as LayoutResult | undefined;
  if (!result) throw new Error("The page did not answer.");
  if (result.stale) throw new Error(STALE_SCAN);
  if (state === "applied" && session.url && result.shapes) await rememberShapes(session.url, result.shapes);
  if (state === "applied" && remember && session.url) await rememberKept(session.url, effectiveGroups(session), chosen.map((group) => group.label));
  return { state, labels: result.applied, missing: result.missing };
}

// Which of these groups could take the user's own order on the page: groups of 3+ items that stay
// on screen. Read-only; an empty record when the page can't be asked.
export async function checkOrderable(target: PageTarget, groups: Array<PlanGroup>): Promise<Record<string, OrderCheck>> {
  const candidates = groups
    .filter((group) => !group.origin && group.members.length >= 3 && !["hide-secondary", "collapse"].includes(group.operation))
    .map(({ label, members }) => ({ label, members }));
  if (candidates.length === 0) return {};
  const [injection] = await chrome.scripting
    .executeScript({
      target: pageTarget(target),
      func: (list: Array<{ label: string; members: Array<string> }>) => globalThis.smartWeb!.checkOrder(list),
      args: [candidates] as [Array<{ label: string; members: Array<string> }>],
    })
    .catch(() => []);
  return (injection?.result as Record<string, OrderCheck> | undefined) ?? {};
}

export async function clearLayout(target: PageTarget) {
  await chrome.scripting
    .executeScript({ target: pageTarget(target), func: () => globalThis.smartWeb?.restore() })
    .catch(() => {});
  await removeSheet(target);
}

// The plan's groups with the user's answers applied.
export function effectiveGroups(session: TabSession): Array<PlanGroup> {
  const proposal = session.proposal;
  if (!proposal?.plan || !proposal.accepted) return [];
  return applyAnswers(proposal.accepted, usableQuestions(proposal.plan, proposal.accepted), proposal.answers ?? {});
}

// Of those, the groups the user picked, by label.
export function pickGroups(session: TabSession, labels: Array<string> | undefined): Array<PlanGroup> {
  const groups = effectiveGroups(session);
  return labels ? groups.filter((group) => labels.includes(group.label)) : groups;
}
