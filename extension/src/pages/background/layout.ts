import { LAYOUT_CSS } from "../../shared/layout-css";
import type { PlanGroup } from "../../shared/plan";
import type { LayoutState, TabSession } from "../../shared/types";

import type { LayoutGroup, LayoutResult } from "../content/apply";

async function removeSheet(tabId: number) {
  await chrome.scripting.removeCSS({ target: { tabId }, css: LAYOUT_CSS }).catch(() => {});
}

// Puts the chosen groups on the page. Returns the new layout state for the session.
export async function showLayout(
  tabId: number,
  groups: Array<PlanGroup>,
  state: LayoutState["state"]
): Promise<LayoutState | undefined> {
  const chosen = groups.filter((group) => group.operation !== "none");
  if (chosen.length === 0) return undefined;

  await removeSheet(tabId);
  await chrome.scripting.insertCSS({ target: { tabId }, css: LAYOUT_CSS });
  const layout: Array<LayoutGroup> = chosen.map(({ label, container, members, operation }) => ({
    label,
    container,
    members,
    operation,
  }));
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (groups: Array<LayoutGroup>, preview: boolean) => globalThis.smartWeb!.apply(groups, preview),
    args: [layout, state === "preview"] as [Array<LayoutGroup>, boolean],
  });
  const result = injection?.result as LayoutResult | undefined;
  if (!result) throw new Error("The page did not answer.");
  return { state, labels: result.applied, missing: result.missing };
}

export async function clearLayout(tabId: number) {
  await chrome.scripting
    .executeScript({ target: { tabId }, func: () => globalThis.smartWeb?.restore() })
    .catch(() => {});
  await removeSheet(tabId);
}

// The plan's groups the user picked, by label.
export function pickGroups(session: TabSession, labels: Array<string> | undefined): Array<PlanGroup> {
  const accepted = session.proposal?.accepted ?? [];
  return labels ? accepted.filter((group) => labels.includes(group.label)) : accepted;
}
