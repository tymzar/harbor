import type { LayoutPlan } from "../../shared/plan";
import { PLAN_SCHEMA, siteWide, validatePlan } from "../../shared/plan";
import type { VisualGroup } from "../../shared/prompt";
import type { Profile } from "../../shared/profile";
import { PROFILE_KEY, clampToProfile } from "../../shared/profile";
import { describePage, systemPrompt } from "../../shared/prompt";
import { parseSamBoxes, toViewportRect } from "../../shared/sam";
import type { CallLog, PageScan, Proposal, TabSession } from "../../shared/types";
import { sessionKey, shotKey } from "../../shared/types";
import type { ChatMessage } from "./meta";
import { proposeJson, segment } from "./meta";
import { checkOrderable, clearLayout } from "./layout";
import { rememberPlan } from "./saved-plans";
import { userGroups } from "./user-groups";

// SAM matches what things look like, not UI names: "card" and "menu" return nothing on
// screenshots, these do (docs/hackathon/api-probe-2026-10-27.md).
export const SAM_CONCEPTS = ["button", "rounded rectangle", "gray box", "icon"];

// Set at build time (SMART_WEB_REASONING_EFFORT, default "low"); empty means the model's default.
declare const __REASONING_EFFORT__: "low" | "medium" | "high" | "";
const REASONING_EFFORT = __REASONING_EFFORT__ || undefined;

type BoxMatchResult = Array<{ box: number; nodeId: string | undefined; iou: number }> | { error: string };

async function readSession(tabId: number): Promise<TabSession | undefined> {
  const key = sessionKey(tabId);
  const stored = await chrome.storage.session.get(key);
  return stored[key] as TabSession | undefined;
}

async function updateProposal(tabId: number, change: Partial<Proposal>) {
  const key = sessionKey(tabId);
  const stored = await readSession(tabId);
  if (!stored?.proposal) return;
  await chrome.storage.session.set({
    [key]: { ...stored, proposal: { ...stored.proposal, ...change }, updatedAt: Date.now() },
  });
}

// Elements SAM found looking alike, matched to scanned elements and grouped by shared parent.
async function findVisualGroups(
  tabId: number,
  scan: PageScan,
  screenshot: string,
  calls: Array<CallLog>
): Promise<Array<VisualGroup>> {
  const answers = await Promise.all(SAM_CONCEPTS.map((concept) => segment(concept, screenshot)));

  await updateProposal(tabId, { step: "matching", calls: [...calls, ...answers.map((answer) => answer.log)] });

  const parentOf = new Map(scan.nodes.map((node) => [node.id, node.parent]));
  const groups: Array<VisualGroup> = [];

  for (const [index, answer] of answers.entries()) {
    const boxes = parseSamBoxes(answer.text).map((box) => toViewportRect(box, scan.viewport.w));
    if (boxes.length === 0) {
      calls.push({ ...answer.log, matches: 0 });
      continue;
    }
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (rects) => globalThis.smartWeb!.match(rects),
      args: [boxes],
    });
    const result = injection?.result as BoxMatchResult | undefined;
    if (!result || "error" in result) throw new Error(result?.error ?? "Couldn't match boxes on the page.");

    const matched = [...new Set(result.flatMap((match) => (match.nodeId ? [match.nodeId] : [])))];
    calls.push({ ...answer.log, matches: matched.length });

    const byParent = new Map<string, Array<string>>();
    for (const id of matched) {
      const parent = parentOf.get(id);
      if (parent) byParent.set(parent, [...(byParent.get(parent) ?? []), id]);
    }
    for (const [parent, nodeIds] of byParent)
      if (nodeIds.length >= 2) groups.push({ concept: SAM_CONCEPTS[index], parent, nodeIds });
  }
  return groups;
}

// auto: Harbor asked by itself (a new kind of page on a followed site), not the user.
export async function propose(tabId: number, includeScreenshot: boolean, goal: string | undefined, auto = false) {
  const key = sessionKey(tabId);
  const session = await readSession(tabId);
  const scan = session?.status === "ready" ? session.scan : undefined;
  if (!session || !scan) return;
  // Hides the user made by hand outlive a new plan for the same scan.
  const ownGroups = userGroups(session, scan.scannedAt);

  // A new plan replaces the one the current layout came from.
  if (session.layout) await clearLayout(tabId);
  const shot = await chrome.storage.session.get(shotKey(tabId));
  const screenshot = shot[shotKey(tabId)] as string | undefined;
  const usedScreenshot = includeScreenshot && Boolean(screenshot);
  const calls: Array<CallLog> = [];
  const startedAt = Date.now();
  await chrome.storage.session.set({
    [key]: {
      ...session,
      layout: undefined,
      proposal: {
        status: "running",
        step: usedScreenshot ? "segmenting" : "planning",
        scannedAt: scan.scannedAt,
        usedScreenshot,
        calls,
        repaired: false,
        ...(auto ? { auto: true as const } : {}),
        startedAt,
      },
      updatedAt: Date.now(),
    },
  });

  try {
    const visualGroups = usedScreenshot ? await findVisualGroups(tabId, scan, screenshot!, calls) : undefined;
    await updateProposal(tabId, { step: "planning", calls: [...calls], visualGroups });

    // The user's harbor goes with every request; without one (setup skipped in tests) Spark's defaults apply.
    const stored = await chrome.storage.local.get(PROFILE_KEY);
    const profile = stored[PROFILE_KEY] as Profile | undefined;
    const special = goal?.trim() || undefined;
    const messages: Array<ChatMessage> = [
      { role: "system", content: systemPrompt(Boolean(profile)) },
      { role: "user", content: describePage(scan, visualGroups, special, profile) },
    ];
    const first = await proposeJson(messages, PLAN_SCHEMA, "layout plan", REASONING_EFFORT);
    calls.push(first.log);
    let plan = first.json as LayoutPlan;
    let validation = validatePlan(plan, scan);
    let repaired = false;

    // One repair round with the validator's findings; whatever still fails is dropped.
    if (validation.errors.length > 0) {
      await updateProposal(tabId, { step: "repairing", calls: [...calls] });
      const second = await proposeJson(
        [
          ...messages,
          { role: "assistant", content: JSON.stringify(plan) },
          {
            role: "user",
            content: `A validator rejected parts of this plan:\n- ${validation.errors.join("\n- ")}\nReturn the full corrected plan.`,
          },
        ],
        PLAN_SCHEMA,
        "repair",
        REASONING_EFFORT
      );
      calls.push(second.log);
      plan = second.json as LayoutPlan;
      validation = validatePlan(plan, scan);
      repaired = true;
    }

    const carried = ownGroups.filter((own) => !plan.groups.some((group) => group.label === own.label));
    plan = { ...plan, groups: [...plan.groups, ...carried] };
    const accepted = siteWide([...clampToProfile(validation.accepted, profile, Boolean(special)), ...carried], scan);
    plan = { ...plan, groups: plan.groups.map((group) => accepted.find((own) => own.label === group.label) ?? group) };

    await updateProposal(tabId, {
      status: "done",
      step: undefined,
      calls: [...calls],
      visualGroups,
      plan,
      accepted,
      orderable: await checkOrderable(tabId, accepted),
      errors: validation.errors,
      repaired,
      finishedAt: Date.now(),
    });
    if (accepted.length > 0) await rememberPlan({ ...plan, groups: accepted }, scan, usedScreenshot);
    console.info("[smart-web] proposal", { url: scan.url, calls, errors: validation.errors });
  } catch (error) {
    await updateProposal(tabId, {
      status: "error",
      step: undefined,
      calls: [...calls],
      error: error instanceof Error ? error.message : String(error),
      finishedAt: Date.now(),
    });
  }
}
