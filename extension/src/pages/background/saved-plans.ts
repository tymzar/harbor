import type { SavedPlan } from "../../shared/cache";
import { MAX_SAVED_PLANS, findSavedPlan, pageKey, remapPlan, savePlan } from "../../shared/cache";
import type { LayoutPlan } from "../../shared/plan";
import { validatePlan } from "../../shared/plan";
import type { PageScan, Proposal } from "../../shared/types";

// Plans are kept on this device only (chrome.storage.local), newest first, one per page.
const STORAGE_KEY = "savedPlans";

async function readAll(): Promise<Array<SavedPlan>> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as Array<SavedPlan> | undefined) ?? [];
}

export async function rememberPlan(plan: LayoutPlan, scan: PageScan, usedScreenshot: boolean) {
  const entry = savePlan(plan, scan, usedScreenshot, Date.now());
  const all = await readAll();
  const others = all.filter((saved) => saved.url !== entry.url);
  await chrome.storage.local.set({ [STORAGE_KEY]: [entry, ...others].slice(0, MAX_SAVED_PLANS) });
}

export async function forgetPlan(url: string) {
  const key = pageKey(url);
  const all = await readAll();
  const remaining = all.filter((saved) => saved.url !== key);
  await chrome.storage.local.set({ [STORAGE_KEY]: remaining });
}

// A saved plan rebuilt for this scan, or undefined when none applies or nothing survives validation.
export async function reusePlan(scan: PageScan): Promise<Proposal | undefined> {
  const found = findSavedPlan(await readAll(), scan.url);
  if (!found) return undefined;

  const plan = remapPlan(found.saved, scan);
  const { accepted, errors } = validatePlan(plan, scan);
  if (accepted.length === 0) return undefined;

  const now = Date.now();
  return {
    status: "done",
    scannedAt: scan.scannedAt,
    usedScreenshot: found.saved.usedScreenshot,
    calls: [],
    plan,
    accepted,
    errors,
    repaired: false,
    reused: { match: found.match, savedAt: found.saved.savedAt, fromUrl: found.saved.url },
    startedAt: now,
    finishedAt: now,
  };
}
