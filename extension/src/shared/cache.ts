import type { LayoutPlan } from "./plan";
import type { Answers } from "./questions";
import { groupPattern, urlPatternMatches } from "./plan";
import type { PagePrint, RegionPrint } from "./region";
import { contextFor, distinctIdentity, findMembers, findRows, matchRegions, pageChanged, pagePrint, regionHolds, regionPrint, treeOf } from "./region";
import type { NodeKind, PageScan, Rect, ScanNode } from "./types";

// Saved plans outlive the scan they came from, but node IDs don't. Each referenced node is
// saved as a signature and found again in the next scan before the plan is reused.

export type NodeSignature = {
  tag: string;
  kind: NodeKind;
  attrs?: Record<string, string>;
  href?: string;
  // Text without digits, so "Issues 12" and "Issues 13" are the same item.
  text: string;
  rect: Rect;
};

// A content list (files, issues, products) differs per page; it is found again as "the
// container's children of this shape" rather than item by item.
export type RowShape = { tag: string; kind: NodeKind };

export type SavedPlan = {
  url: string;
  plan: LayoutPlan;
  signatures: Record<string, NodeSignature>;
  // Per group, aligned with plan.groups; undefined where items are matched one by one.
  rows?: Array<RowShape | undefined>;
  // Per group, aligned with plan.groups: what the region looked like (region.ts). Plans saved
  // before region fingerprints lack it and are matched element by element only.
  regions?: Array<RegionPrint | undefined>;
  // The page's landmark/heading skeleton when saved; a different hash means the page changed.
  page?: PagePrint;
  usedScreenshot: boolean;
  // The user's answers to the plan's questions, reused with the plan.
  answers?: Answers;
  savedAt: number;
};

export const MAX_SAVED_PLANS = 50;
// chrome.storage.local key holding Array<SavedPlan>, newest first.
export const SAVED_PLANS_KEY = "savedPlans";

const stableText = (text: string) => text.replaceAll(/\d+/g, "").replaceAll(/\s+/g, " ").trim();

export function pageKey(url: string): string {
  const { origin, pathname } = new URL(url);
  return `${origin}${pathname.replace(/\/$/, "")}`;
}

export function signatureOf(node: ScanNode): NodeSignature {
  return { tag: node.tag, kind: node.kind, attrs: node.attrs, href: node.href, text: stableText(node.text), rect: node.rect };
}

export function savePlan(plan: LayoutPlan, scan: PageScan, usedScreenshot: boolean, now: number): SavedPlan {
  const byId = new Map(scan.nodes.map((node) => [node.id, node]));
  const rows = plan.groups.map((group) => rowShape(group, scan, byId));
  const signatures: Record<string, NodeSignature> = {};
  // Containers always; members only where they are matched one by one.
  const ids = plan.groups.flatMap((group, index) => [group.container, ...(rows[index] ? [] : group.members)]);
  for (const id of ids) {
    const node = byId.get(id);
    if (node) signatures[id] = signatureOf(node);
  }
  const tree = treeOf(scan);
  const regions = plan.groups.map((group, index) => regionPrint(tree, group.container, group.members, Boolean(rows[index])));
  return { url: pageKey(scan.url), plan, signatures, rows, regions, page: pagePrint(scan), usedScreenshot, savedAt: now };
}

// Groups with a stable per-item identity (tabs) keep it; other groups whose members are every
// direct child of one shape (the whole list) are saved by that shape. A group that picks some of
// the rows ("hide Shorts" in the menu) is matched item by item, or it would come back as all of them.
function rowShape(group: LayoutPlan["groups"][number], scan: PageScan, byId: Map<string, ScanNode>): RowShape | undefined {
  if (group.reorderable || group.members.length < 2) return undefined;
  const members = group.members.map((id) => byId.get(id));
  const first = members[0];
  if (!first || members.some((node) => !node || node.parent !== group.container || node.tag !== first.tag || node.kind !== first.kind))
    return undefined;
  const rows = scan.nodes.filter((node) => node.parent === group.container && node.tag === first.tag && node.kind === first.kind);
  return rows.length === new Set(group.members).size ? { tag: first.tag, kind: first.kind } : undefined;
}

// The saved plan for this exact page, else the newest one with a group that covers it.
export function findSavedPlan(
  saved: Array<SavedPlan>,
  url: string
): { saved: SavedPlan; match: "page" | "template" } | undefined {
  const key = pageKey(url);
  const newestFirst = saved.toSorted((a, b) => b.savedAt - a.savedAt);
  const exact = newestFirst.find((entry) => entry.url === key);
  if (exact) return { saved: exact, match: "page" };
  const template = newestFirst.find((entry) =>
    entry.plan.groups.some((group) => urlPatternMatches(groupPattern(entry.plan, group), url))
  );
  return template ? { saved: template, match: "template" } : undefined;
}

function score(signature: NodeSignature, node: ScanNode): number {
  if (signature.tag !== node.tag || signature.kind !== node.kind) return -1;
  let total = 0;
  for (const [name, value] of Object.entries(signature.attrs ?? {}))
    if (node.attrs?.[name] === value) total += 3;
  if (signature.href && signature.href === node.href) total += 3;
  if (signature.text && signature.text === stableText(node.text)) total += 2;
  return total;
}

const distance = (a: Rect, b: Rect) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h);

// Finds each saved node in the new scan. A node matches on content (attributes, link, text);
// position only breaks ties, or identifies an element with no content at exactly the same place.
export function locateNodes(signatures: Record<string, NodeSignature>, scan: PageScan): Map<string, string> {
  const found = new Map<string, string>();
  const taken = new Set<string>();

  for (const [oldId, signature] of Object.entries(signatures)) {
    // A node with an identity must match on it; same position alone would swap tabs.
    const identifiable = Boolean(signature.text || signature.href || signature.attrs);
    let best: { id: string; score: number; distance: number } | undefined;
    for (const node of scan.nodes) {
      if (taken.has(node.id)) continue;
      const points = score(signature, node);
      if (points < 0) continue;
      const away = distance(signature.rect, node.rect);
      if (points === 0 && (identifiable || away > 8)) continue;
      if (!best || points > best.score || (points === best.score && away < best.distance))
        best = { id: node.id, score: points, distance: away };
    }
    if (best) {
      found.set(oldId, best.id);
      taken.add(best.id);
    }
  }
  return found;
}

// The saved plan rewritten to this scan's IDs, keeping only groups whose pattern covers this
// page. Item groups drop members that no longer exist; row groups take the container's current
// rows. Groups whose container is gone are dropped. The result still has to pass validatePlan.
export function remapPlan(saved: SavedPlan, scan: PageScan): LayoutPlan {
  return saved.regions ? remapRegions(saved, scan).plan : remapNodes(saved, scan);
}

// Element by element: exact attributes, link and text (plans saved before region fingerprints).
export function remapNodes(saved: SavedPlan, scan: PageScan): LayoutPlan {
  const found = locateNodes(saved.signatures, scan);
  const groups = saved.plan.groups.flatMap((group, index) => {
    if (!urlPatternMatches(groupPattern(saved.plan, group), scan.url)) return [];
    const container = found.get(group.container);
    if (!container) return [];
    const shape = saved.rows?.[index];
    const members = shape
      ? scan.nodes.filter((node) => node.parent === container && node.tag === shape.tag && node.kind === shape.kind).map((node) => node.id)
      : group.members.flatMap((id) => {
          const next = found.get(id);
          return next ? [next] : [];
        });
    return members.length > 0 ? [{ ...group, container, members }] : [];
  });
  return { ...saved.plan, groups };
}

// What happened to each saved group on this page, by confidence:
//   same    found where it was: applied silently;
//   moved   found less surely or elsewhere: applied, and named in the panel;
//   skipped found too unsurely for its operation (hiding needs more): not applied, named;
//   lost    not found, or the region was redesigned: the groups to ask Spark for again.
export type Band = "same" | "moved" | "skipped" | "lost";
export type GroupReport = { label: string; band: Band; confidence: number };
export type Remap = { plan: LayoutPlan; report: Array<GroupReport>; changed: { skeleton: boolean; structure: boolean } };

export const BANDS = { same: 0.75, apply: 0.6, applyHide: 0.7, found: 0.45 };

function bandOf(confidence: number, geometry: number, operation: string): Band {
  if (confidence >= BANDS.same && geometry >= 0.8) return "same";
  if (confidence >= (operation === "hide-secondary" ? BANDS.applyHide : BANDS.apply)) return "moved";
  return confidence >= BANDS.found ? "skipped" : "lost";
}

// Region by region: each saved group's container is found by its region fingerprint (shape, rows,
// place among the aligned landmarks and headings, geometry, and the element's own identity), then
// its members inside it. Only same and moved groups are in the plan.
export function remapRegions(saved: SavedPlan, scan: PageScan, keep: Array<Band> = ["same", "moved"]): Remap {
  const tree = treeOf(scan);
  const page = pagePrint(scan);
  const context = contextFor(tree, saved.page?.skeleton ?? []);
  const wanted = saved.plan.groups.flatMap((group, index) => {
    const print = saved.regions?.[index];
    const signature = saved.signatures[group.container];
    return print && signature ? [{ key: group.container, print, saved: distinctIdentity(signature, print) }] : [];
  });
  const containers = matchRegions(context, wanted);
  const report: Array<GroupReport> = [];
  const groups = saved.plan.groups.flatMap((group, index) => {
    if (!urlPatternMatches(groupPattern(saved.plan, group), scan.url)) return [];
    const match = containers.get(group.container);
    const lost = () => {
      report.push({ label: group.label, band: "lost" as const, confidence: match?.confidence ?? 0 });
      return [];
    };
    if (!match) return lost();
    const shape = saved.rows?.[index];
    let members: Array<string>;
    if (shape) members = findRows(tree, match.id, shape, saved.regions?.[index]?.row);
    else {
      const prints = saved.regions?.[index]?.members ?? {};
      const found = findMembers(
        tree,
        match.id,
        group.members.flatMap((id) => {
          const signature = saved.signatures[id];
          return signature ? [{ id, saved: signature, print: prints[id], isContainer: id === group.container }] : [];
        }),
        group.reorderable,
        regionHolds(tree, saved.regions![index]!, match.id),
        context.textGone
      );
      members = group.members.flatMap((id) => found.get(id) ?? []);
    }
    if (members.length === 0) return lost();
    const band = bandOf(match.confidence, match.geometry, group.operation);
    report.push({ label: group.label, band, confidence: Math.round(match.confidence * 100) / 100 });
    return keep.includes(band) ? [{ ...group, container: match.id, members }] : [];
  });
  return { plan: { ...saved.plan, groups }, report, changed: pageChanged(saved.page, page) };
}
