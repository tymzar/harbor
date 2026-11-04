import type { Band, SavedPlan } from "../../shared/cache";
import { MAX_SAVED_PLANS, SAVED_PLANS_KEY, findSavedPlan, pageKey, remapPlan, remapRegions, savePlan, siteOf, transferGroups } from "../../shared/cache";
import type { LayoutPlan, PlanGroup } from "../../shared/plan";
import { siteWide, validatePlan } from "../../shared/plan";
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

// The groups of a proposal that belong to this page's own plan: not the ones transferred from
// other pages' plans, which are saved where they came from.
export const ownGroups = (proposal: Proposal): Array<PlanGroup> =>
  (proposal.accepted ?? []).filter((group) => !transferredFrom(proposal)[group.label]);

// Where a transferred group is saved, whether the plan was reused or drafted around it.
export const transferredFrom = (proposal: Proposal): Record<string, string> => ({ ...proposal.reused?.transferred, ...proposal.transferred });

// What the user kept, per change: its site and label ("linkedin.com\nTop navigation"). A kept
// change comes back by itself on every page of the site where its region is found again, until
// Restore: a header change kept on the feed is kept on the messaging page too. Kept apart from the
// plans, which are saved before anything is kept. (Keys were "<pattern>\n<label>" until 4 Nov;
// old keys are ignored.)
const KEPT_KEY = "keptChanges";
const keptKey = (url: string, group: PlanGroup) => `${siteOf(url) ?? url}\n${group.label}`;

async function readKept(): Promise<Record<string, true>> {
  const stored = await chrome.storage.local.get(KEPT_KEY);
  return (stored[KEPT_KEY] as Record<string, true> | undefined) ?? {};
}

// Of the page's groups, those in `labels` are kept and the others not; no labels clears them all.
export async function rememberKept(url: string, groups: Array<PlanGroup>, labels: Array<string> = []) {
  const kept = await readKept();
  for (const group of groups) {
    if (labels.includes(group.label)) kept[keptKey(url, group)] = true;
    else delete kept[keptKey(url, group)];
  }
  await chrome.storage.local.set({ [KEPT_KEY]: kept });
}

export async function keptLabels(url: string, groups: Array<PlanGroup>): Promise<Array<string>> {
  const kept = await readKept();
  return groups.filter((group) => kept[keptKey(url, group)]).map((group) => group.label);
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

// A group learned over a transferred group (its order) is saved with the plan the source group
// lives in, over the source's saved elements, so it is found again wherever the source is: the
// one saved layout grows instead of a second entry appearing for the page it was learned on.
// False when that plan or group is gone.
export async function rememberWithSource(savedUrl: string, sourceLabel: string, group: PlanGroup): Promise<boolean> {
  const all = await readAll();
  const saved = all.find((entry) => entry.url === savedUrl);
  const index = saved?.plan.groups.findIndex((candidate) => candidate.label === sourceLabel) ?? -1;
  if (!saved || index < 0) return false;
  const source = saved.plan.groups[index];
  const keep = saved.plan.groups.map((candidate) => candidate.label !== group.label);
  const learned: PlanGroup = { ...group, urlPattern: source.urlPattern, container: source.container, members: source.members };
  await upgradePlan(saved, {
    ...saved,
    plan: { ...saved.plan, groups: [...only(saved.plan.groups, keep)!, learned] },
    rows: saved.rows && [...only(saved.rows, keep)!, saved.rows[index]],
    regions: saved.regions && [...only(saved.regions, keep)!, saved.regions[index]],
  });
  return true;
}

// A saved plan rebuilt for this scan, plus the groups of the site's other saved plans found again
// on it; undefined when none applies or nothing survives validation.
export async function reusePlan(scan: PageScan): Promise<Proposal | undefined> {
  const all = await readAll();
  const found = findSavedPlan(all, scan.url);
  // A plan matched by template is read by URL first; the groups whose pattern leaves this page out
  // are then looked for by structure like any other plan's. The exact page's plan has none such.
  const shared = transferGroups(all, found?.match === "page" ? found.saved : undefined, scan);
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
  // The page's own plan speaks for a region first: a transferred group on the same element, or
  // with the same name, is left out.
  const extra = shared.filter(({ group }) => !own.accepted.some((other) => other.label === group.label || other.container === group.container));
  const accepted = [...own.accepted, ...extra.map(({ group }) => group)];
  if (accepted.length === 0) return undefined;
  const host = new URL(scan.url).host;
  const merged: LayoutPlan = plan
    ? { ...plan, groups: [...plan.groups, ...extra.map(({ group }) => group)] }
    : { summary: "Changes you kept elsewhere on this site.", template: { urlPattern: `${host}/*`, pageKind: "other" }, groups: extra.map(({ group }) => group) };

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
    reused: {
      match: found?.match ?? "template",
      savedAt: found?.saved.savedAt ?? now,
      fromUrl: found?.saved.url ?? host,
      drift,
      transferred: extra.length > 0 ? Object.fromEntries(extra.map(({ group, fromUrl }) => [group.label, fromUrl])) : undefined,
    },
    startedAt: now,
    finishedAt: now,
  };
}
