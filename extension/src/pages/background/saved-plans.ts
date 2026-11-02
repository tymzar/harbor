import type { Band, SavedPlan } from "../../shared/cache";
import { MAX_SAVED_PLANS, SAVED_PLANS_KEY, findSavedPlan, pageKey, remapPlan, remapRegions, savePlan } from "../../shared/cache";
import type { LayoutPlan, PlanGroup } from "../../shared/plan";
import { groupPattern, isSiteWide, siteWide, urlPatternMatches, validatePlan } from "../../shared/plan";
import type { Answers } from "../../shared/questions";
import type { PageScan, Proposal } from "../../shared/types";

// Plans are kept on this device only (chrome.storage.local), newest first, one per page.

async function readAll(): Promise<Array<SavedPlan>> {
  const stored = await chrome.storage.local.get(SAVED_PLANS_KEY);
  return (stored[SAVED_PLANS_KEY] as Array<SavedPlan> | undefined) ?? [];
}

export async function rememberPlan(plan: LayoutPlan, scan: PageScan, usedScreenshot: boolean) {
  const entry = savePlan(plan, scan, usedScreenshot, Date.now());
  const all = await readAll();
  const others = all.filter((saved) => saved.url !== entry.url);
  await chrome.storage.local.set({ [SAVED_PLANS_KEY]: [entry, ...others].slice(0, MAX_SAVED_PLANS) });
}

// What the user kept, per change: its pattern and label ("www.linkedin.com/*\nTop navigation").
// A kept change comes back by itself on every page its pattern covers, until Restore; site-wide
// changes (the header) therefore follow the user across the site. Kept apart from the plans, which
// are saved before anything is kept.
const KEPT_KEY = "keptChanges";
const keptKey = (plan: LayoutPlan, group: PlanGroup) => `${groupPattern(plan, group)}\n${group.label}`;

async function readKept(): Promise<Record<string, true>> {
  const stored = await chrome.storage.local.get(KEPT_KEY);
  return (stored[KEPT_KEY] as Record<string, true> | undefined) ?? {};
}

// Of the plan's groups, those in `labels` are kept and the others not; no labels clears them all.
export async function rememberKept(plan: LayoutPlan, groups: Array<PlanGroup>, labels: Array<string> = []) {
  const kept = await readKept();
  for (const group of groups) {
    if (labels.includes(group.label)) kept[keptKey(plan, group)] = true;
    else delete kept[keptKey(plan, group)];
  }
  await chrome.storage.local.set({ [KEPT_KEY]: kept });
}

export async function keptLabels(plan: LayoutPlan, groups: Array<PlanGroup>): Promise<Array<string>> {
  const kept = await readKept();
  return groups.filter((group) => kept[keptKey(plan, group)]).map((group) => group.label);
}

export async function rememberAnswers(url: string, answers: Answers) {
  const key = pageKey(url);
  const all = await readAll();
  await chrome.storage.local.set({
    [SAVED_PLANS_KEY]: all.map((saved) => (saved.url === key ? { ...saved, answers } : saved)),
  });
}

export async function forgetPlan(url: string) {
  const key = pageKey(url);
  const all = await readAll();
  const remaining = all.filter((saved) => saved.url !== key);
  await chrome.storage.local.set({ [SAVED_PLANS_KEY]: remaining });
}

// Replaces a saved entry in place, keeping its answers.
async function upgradePlan(old: SavedPlan, next: SavedPlan) {
  const all = await readAll();
  await chrome.storage.local.set({
    [SAVED_PLANS_KEY]: all.map((saved) => (saved.url === old.url && saved.savedAt === old.savedAt ? { ...next, answers: old.answers } : saved)),
  });
}

// The entries of a per-group list (groups, rows, regions) whose group is kept.
const only = <T,>(list: Array<T> | undefined, keep: Array<boolean>) => list?.filter((_, index) => keep[index]);

// Site-wide groups (header, top navigation) saved with other pages' plans, rebuilt for this scan:
// they apply on every page of the site, whichever page they were planned on.
function siteWideGroups(all: Array<SavedPlan>, skip: SavedPlan | undefined, scan: PageScan): Array<PlanGroup> {
  const found: Array<PlanGroup> = [];
  for (const saved of all.toSorted((a, b) => b.savedAt - a.savedAt)) {
    if (saved === skip) continue;
    const keep = saved.plan.groups.map((group) => {
      const pattern = groupPattern(saved.plan, group);
      return isSiteWide(pattern, scan.url) && urlPatternMatches(pattern, scan.url);
    });
    if (!keep.some(Boolean)) continue;
    const part: SavedPlan = {
      ...saved,
      plan: { ...saved.plan, template: { ...saved.plan.template, urlPattern: groupPattern(saved.plan, saved.plan.groups[keep.indexOf(true)]) }, groups: only(saved.plan.groups, keep)! },
      rows: only(saved.rows, keep),
      regions: only(saved.regions, keep),
    };
    const plan = remapPlan(part, scan);
    for (const group of validatePlan(plan, scan).accepted)
      if (!found.some((other) => other.label === group.label)) found.push(group);
  }
  return found;
}

// A saved plan rebuilt for this scan, plus the site-wide groups of other saved plans; undefined when
// none applies or nothing survives validation.
export async function reusePlan(scan: PageScan): Promise<Proposal | undefined> {
  const all = await readAll();
  const found = findSavedPlan(all, scan.url);
  const shared = siteWideGroups(all, found?.saved, scan);
  if (!found && shared.length === 0) return undefined;

  // Plans saved with region fingerprints are matched region by region and say what moved; older
  // ones element by element, and are re-saved with fingerprints once all their groups are found.
  let plan: LayoutPlan | undefined;
  let drift: NonNullable<Proposal["reused"]>["drift"];
  if (found?.saved.regions) {
    const remap = remapRegions(found.saved, scan);
    plan = remap.plan;
    const labels = (band: Band) => remap.report.filter((entry) => entry.band === band).map((entry) => entry.label);
    drift = { moved: labels("moved"), skipped: labels("skipped"), lost: labels("lost"), changed: remap.changed.skeleton || remap.changed.structure };
  } else if (found) {
    plan = remapPlan(found.saved, scan);
    if (found.match === "page" && plan.groups.length === found.saved.plan.groups.length)
      await upgradePlan(found.saved, savePlan(plan, scan, found.saved.usedScreenshot, found.saved.savedAt));
  }
  const own = plan ? validatePlan(plan, scan) : { accepted: [], errors: [] };
  // Plans saved before site chrome was made site-wide get their header and navigation widened, once.
  const widened = siteWide(own.accepted, scan);
  const changed = new Map(widened.filter((group, index) => group.urlPattern !== own.accepted[index].urlPattern).map((group) => [group.label, group.urlPattern]));
  if (found && changed.size > 0) {
    own.accepted = widened;
    plan = { ...plan!, groups: plan!.groups.map((group) => ({ ...group, urlPattern: changed.get(group.label) ?? group.urlPattern })) };
    await upgradePlan(found.saved, {
      ...found.saved,
      plan: { ...found.saved.plan, groups: found.saved.plan.groups.map((group) => ({ ...group, urlPattern: changed.get(group.label) ?? group.urlPattern })) },
    });
  }
  const extra = shared.filter((group) => !own.accepted.some((other) => other.label === group.label));
  const accepted = [...own.accepted, ...extra];
  if (accepted.length === 0) return undefined;
  const host = new URL(scan.url).host;
  const merged: LayoutPlan = plan
    ? { ...plan, groups: [...plan.groups, ...extra] }
    : { summary: "Site-wide changes you kept elsewhere on this site.", template: { urlPattern: `${host}/*`, pageKind: "other" }, groups: extra };

  const now = Date.now();
  return {
    status: "done",
    scannedAt: scan.scannedAt,
    usedScreenshot: found?.saved.usedScreenshot ?? false,
    calls: [],
    plan: merged,
    accepted,
    errors: own.errors,
    repaired: false,
    answers: found?.saved.answers,
    reused: { match: found?.match ?? "template", savedAt: found?.saved.savedAt ?? now, fromUrl: found?.saved.url ?? host, drift },
    startedAt: now,
    finishedAt: now,
  };
}
