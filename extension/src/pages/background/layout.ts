import { LAYOUT_CSS } from "../../shared/layout-css";
import type { PlanGroup } from "../../shared/plan";
import { applyAnswers, usableQuestions } from "../../shared/questions";
import type { LayoutState, TabSession } from "../../shared/types";

import type { LayoutGroup, LayoutResult } from "../content/apply";
import { rememberKept } from "./saved-plans";

export const STALE_SCAN = "The page changed since Harbor read it. Rescan, then try again.";

async function removeSheet(tabId: number) {
  await chrome.scripting.removeCSS({ target: { tabId }, css: LAYOUT_CSS }).catch(() => {});
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
  const tabId = session.tabId;
  const chosen = groups.filter((group) => group.operation !== "none");
  if (chosen.length === 0) return undefined;
  // Regions the plan leaves alone are still watched for clicks, so learning sees them
  // (the user's tabs are usually left as they are, and are what they open most).
  const watched = effectiveGroups(session).filter(
    (group) => group.operation === "none" && !chosen.some((other) => other.label === group.label)
  );

  await removeSheet(tabId);
  await chrome.scripting.insertCSS({ target: { tabId }, css: LAYOUT_CSS });
  const layout: Array<LayoutGroup> = [...chosen, ...watched].map(({ label, container, members, operation, origin }) => ({
    label,
    container,
    members,
    operation,
    first: origin === "learned" && operation === "emphasize",
  }));
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (groups: Array<LayoutGroup>, preview: boolean, scannedAt: number) =>
      globalThis.smartWeb!.apply(groups, preview, scannedAt),
    args: [layout, state === "preview", session.scan?.scannedAt ?? 0] as [Array<LayoutGroup>, boolean, number],
  });
  const result = injection?.result as LayoutResult | undefined;
  if (!result) throw new Error("The page did not answer.");
  if (result.stale) throw new Error(STALE_SCAN);
  const plan = session.proposal?.plan;
  if (state === "applied" && remember && plan) await rememberKept(plan, effectiveGroups(session), chosen.map((group) => group.label));
  return { state, labels: result.applied, missing: result.missing };
}

export async function clearLayout(tabId: number) {
  await chrome.scripting
    .executeScript({ target: { tabId }, func: () => globalThis.smartWeb?.restore() })
    .catch(() => {});
  await removeSheet(tabId);
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
