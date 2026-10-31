import type { Band, SavedPlan } from "../../src/shared/cache";
import { remapNodes, remapRegions, savePlan } from "../../src/shared/cache";
import { contextFor, distinctIdentity, scoreRegion, treeOf } from "../../src/shared/region";
import type { LayoutPlan, PlanGroup } from "../../src/shared/plan";
import type { PageScan, ScanNode } from "../../src/shared/types";
import type { Mutated, Rng, Target } from "./mutate";
import { MUTATIONS, flatten, rng, toTree } from "./mutate";

// Plans a model might have made for a page, built from the scan alone: whole lists (rows), one
// row of a list (item by item), landmark regions, and single elements picked by the user.
export function synthesize(scan: PageScan, random: Rng): Array<PlanGroup> {
  const host = new URL(scan.url).host;
  const children = new Map<string, Array<ScanNode>>();
  for (const node of scan.nodes) if (node.parent) children.set(node.parent, [...(children.get(node.parent) ?? []), node]);
  const visible = (node: ScanNode) => node.rect.w >= 20 && node.rect.h >= 10 && node.depth > 0 && !node.sensitive;
  const used = new Set<string>();
  const base = { urlPattern: `${host}/*`, reorderable: false, identity: { source: "none" as const, attribute: "" }, reason: "synthetic" };
  const shuffle = <T>(list: Array<T>) => list.map((item) => ({ item, key: random() })).toSorted((a, b) => a.key - b.key).map(({ item }) => item);

  const lists = shuffle(
    scan.nodes.filter(visible).flatMap((node) => {
      const kids = children.get(node.id) ?? [];
      const first = kids[0];
      if (!first) return [];
      const rows = kids.filter((kid) => kid.tag === first.tag && kid.kind === first.kind && visible(kid));
      return rows.length >= 3 && rows.length === kids.filter((kid) => kid.tag === first.tag && kid.kind === first.kind).length ? [{ node, rows }] : [];
    })
  );
  const groups: Array<PlanGroup> = [];
  const add = (group: Omit<PlanGroup, keyof typeof base | "role"> & Partial<PlanGroup>) => {
    if (used.has(group.container)) return;
    used.add(group.container);
    groups.push({ ...base, role: "other", ...group });
  };
  for (const { node, rows } of lists.slice(0, 3))
    add({ label: `List ${node.id}`, role: "list", container: node.id, members: rows.map((row) => row.id), operation: random() < 0.5 ? "grid" : "compact" });
  for (const { node, rows } of lists.slice(3, 5))
    add({ label: `One row of ${node.id}`, container: node.id, members: [rows[Math.floor(random() * rows.length)].id], operation: "hide-secondary" });
  const landmarks = shuffle(scan.nodes.filter((node) => visible(node) && node.kind === "landmark" && (children.get(node.id)?.length ?? 0) >= 2));
  for (const node of landmarks.slice(0, 2))
    add({ label: `Region ${node.id}`, role: "sidebar", container: node.id, members: children.get(node.id)!.map((kid) => kid.id), operation: "hide-secondary" });
  const blocks = shuffle(scan.nodes.filter((node) => visible(node) && node.kind === "group" && node.rect.h >= 40 && node.rect.w >= 100));
  for (const node of blocks.slice(0, 1))
    add({ label: `Picked ${node.id}`, container: node.id, members: [node.id], operation: "hide-secondary", origin: "user" });
  return groups;
}

export type Outcome = "correct" | "wrong" | "none";

function isAncestor(scan: PageScan, ancestor: string, id: string): boolean {
  const byId = new Map(scan.nodes.map((node) => [node.id, node]));
  for (let current = byId.get(id)?.parent; current; current = byId.get(current)?.parent) if (current === ancestor) return true;
  return false;
}

// Right: every member is the element it was (or a new row of the same list) and the container is
// the same element, or one just around or inside it that still holds all the members.
// Wrong: anything else that was applied. None: the group was not applied.
export function judge(group: PlanGroup, rows: boolean, mutated: Mutated, result: PlanGroup | undefined): { outcome: Outcome; recall: number; gone: boolean } {
  // An element now, or the wrapper standing in for it (a wrapper put inside an element can take
  // its place in the scan: the element is left with one child and is no longer a group).
  const now = (id: string) => [...(mutated.newId.has(id) ? [mutated.newId.get(id)!] : []), ...[...mutated.sameAs].filter(([, origin]) => origin === id).map(([next]) => next)];
  const containers = now(group.container);
  const expected = new Set(group.members.flatMap((id) => [...now(id), ...(rows ? (mutated.clones.get(id) ?? []) : [])]));
  // Gone from the page (redesigned, or its one row removed): reporting it lost is the right answer.
  if (containers.length === 0 || expected.size === 0) return { outcome: result ? "wrong" : "correct", recall: 0, gone: true };
  if (!result) return { outcome: "none", recall: 0, gone: false };
  // A whole list is "the container's current rows": an item of the rows' kind inserted into it (a
  // promo row) belongs to it.
  const row = mutated.scan.nodes.find((node) => expected.has(node.id));
  if (rows && row)
    for (const node of mutated.scan.nodes)
      if (node.parent && containers.includes(node.parent) && node.tag === row.tag && node.kind === row.kind) expected.add(node.id);
  const membersRight = result.members.length > 0 && result.members.every((id) => expected.has(id));
  const holds = result.members.every((id) => id === result.container || isAncestor(mutated.scan, result.container, id));
  const near = containers.some(
    (container) =>
      result.container === container ||
      (holds && (isAncestor(mutated.scan, result.container, container) || isAncestor(mutated.scan, container, result.container)))
  );
  const recall = result.members.filter((id) => expected.has(id)).length / expected.size;
  return { outcome: membersRight && near ? "correct" : "wrong", recall, gone: false };
}

export type Row = {
  site: string;
  mutation: string;
  seed: number;
  label: string;
  operation: string;
  baseline: Outcome;
  region: Outcome;
  ungated: Outcome;
  band: Band | "dropped";
  confidence: number;
  // The group's region still exists after the change (false only for redesigned regions).
  exists: boolean;
  changed: { skeleton: boolean; structure: boolean };
  // DETAIL=1: what was expected and what the region matcher picked, for reading failures.
  detail?: string;
};

// The best container candidates for a saved group, with their scores.
function candidates(saved: SavedPlan, index: number, mutated: Mutated): string {
  const print = saved.regions?.[index];
  const signature = saved.signatures[saved.plan.groups[index].container];
  if (!print || !signature) return "";
  const context = contextFor(treeOf(mutated.scan), saved.page?.skeleton ?? []);
  return mutated.scan.nodes
    .map((node) => ({ node, score: scoreRegion(context, print, distinctIdentity(signature, print), node) }))
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ node, score }) => `    candidate ${node.id} ${score.toFixed(3)} [${node.rect.x},${node.rect.y}] "${node.text.slice(0, 24)}"`)
    .join("\n");
}

function detail(group: PlanGroup, mutated: Mutated, result: PlanGroup | undefined): string {
  const show = (id: string | undefined) => {
    const node = mutated.scan.nodes.find((each) => each.id === id);
    return node ? `${node.id}<${node.tag}.${node.kind} p=${node.parent} [${node.rect.x},${node.rect.y},${node.rect.w},${node.rect.h}] "${node.text.slice(0, 30)}">` : `${id}:-`;
  };
  return [
    `  expected ${show(mutated.newId.get(group.container))} members ${group.members.map((id) => mutated.newId.get(id) ?? "-").join(",")}`,
    `  picked   ${show(result?.container)} members ${result?.members.join(",") ?? "-"}`,
    ...(result?.members.slice(0, 2).map((id) => `    ${show(id)}`) ?? []),
  ].join("\n");
}

export type Cost = { saveMs: number; remapMs: number; baselineMs: number; legacyBytes: number; regionBytes: number; nodes: number };

// A synthetic plan for one page, saved both ways: with region fingerprints and as before (legacy).
export type Prepared = { site: string; groups: Array<PlanGroup>; saved: SavedPlan; legacy: SavedPlan; targets: Array<Target>; saveMs: number };

export function prepare(site: string, base: PageScan): Prepared {
  const groups = synthesize(base, rng(hashSeed(site)));
  const plan: LayoutPlan = { summary: "synthetic", template: { urlPattern: `${new URL(base.url).host}/*`, pageKind: "page" }, groups };
  const started = performance.now();
  const saved = savePlan(plan, base, false, 0);
  const saveMs = performance.now() - started;
  const legacy: SavedPlan = { ...saved, regions: undefined, page: undefined };
  const targets: Array<Target> = groups.map((group, index) => ({ container: group.container, members: group.members, rows: Boolean(saved.rows?.[index]) }));
  return { site, groups, saved, legacy, targets, saveMs };
}

// Both matchers on one changed page, judged group by group.
export function compare(prepared: Prepared, mutated: Mutated, mutation: string, seed: number): { rows: Array<Row>; remapMs: number; baselineMs: number } {
  const { site, groups, saved, legacy } = prepared;
  let started = performance.now();
  const before = remapNodes(legacy, mutated.scan);
  const baselineMs = performance.now() - started;
  started = performance.now();
  const after = remapRegions(saved, mutated.scan);
  const remapMs = performance.now() - started;
  const loose = remapRegions(saved, mutated.scan, ["same", "moved", "skipped", "lost"]);
  const rows = groups.map((group, index): Row => {
    const isRows = Boolean(saved.rows?.[index]);
    const byLabel = (list: Array<PlanGroup>) => list.find((each) => each.label === group.label);
    const report = after.report.find((each) => each.label === group.label);
    return {
      site,
      mutation,
      seed,
      label: group.label,
      operation: group.operation,
      baseline: judge(group, isRows, mutated, byLabel(before.groups)).outcome,
      region: judge(group, isRows, mutated, byLabel(after.plan.groups)).outcome,
      ungated: judge(group, isRows, mutated, byLabel(loose.plan.groups)).outcome,
      band: report?.band ?? "dropped",
      confidence: report?.confidence ?? 0,
      exists: !judge(group, isRows, mutated, undefined).gone,
      changed: after.changed,
      detail: process.env.DETAIL ? `${detail(group, mutated, byLabel(after.plan.groups) ?? byLabel(loose.plan.groups))}\n${candidates(saved, index, mutated)}` : undefined,
    };
  });
  return { rows, remapMs, baselineMs };
}

export function evaluate(site: string, base: PageScan, mutations: Array<string>, seeds: Array<number>): { rows: Array<Row>; cost: Cost } {
  const prepared = prepare(site, base);
  const rows: Array<Row> = [];
  let remapMs = 0;
  let baselineMs = 0;
  let runs = 0;
  for (const mutation of mutations)
    for (const seed of seeds) {
      const mutated = flatten(MUTATIONS[mutation](toTree(base), rng(seed * 7919 + hashSeed(site + mutation)), prepared.targets), base);
      const result = compare(prepared, mutated, mutation, seed);
      rows.push(...result.rows);
      remapMs += result.remapMs;
      baselineMs += result.baselineMs;
      runs += 1;
    }
  return {
    rows,
    cost: {
      saveMs: prepared.saveMs,
      remapMs: remapMs / runs,
      baselineMs: baselineMs / runs,
      legacyBytes: JSON.stringify(prepared.legacy).length,
      regionBytes: JSON.stringify(prepared.saved).length,
      nodes: base.nodes.length,
    },
  };
}

export function hashSeed(text: string): number {
  let value = 2_166_136_261;
  for (const char of text) value = Math.imul(value ^ (char.codePointAt(0) ?? 0), 16_777_619);
  return value >>> 0;
}

const percent = (part: number, total: number) => (total === 0 ? "–" : `${Math.round((100 * part) / total)}%`);

// One line per mutation: correct / wrong / none for the baseline and the region matcher.
export function table(rows: Array<Row>, mutations: Array<string>): string {
  const lines = [
    "| Change | Groups | Baseline correct | Baseline wrong | Baseline none | Region correct | Region wrong | Region none | Region ungated wrong | Skeleton changed | Structure changed |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const mutation of [...mutations, "all"]) {
    const subset = rows.filter((row) => mutation === "all" || row.mutation === mutation);
    const count = (key: "baseline" | "region" | "ungated", outcome: Outcome) => subset.filter((row) => row[key] === outcome).length;
    const runs = [...new Map(subset.map((row) => [`${row.site}/${row.mutation}/${row.seed}`, row.changed])).values()];
    lines.push(
      `| ${mutation} | ${subset.length} | ${percent(count("baseline", "correct"), subset.length)} | ${percent(count("baseline", "wrong"), subset.length)} | ${percent(count("baseline", "none"), subset.length)} | ${percent(count("region", "correct"), subset.length)} | ${percent(count("region", "wrong"), subset.length)} | ${percent(count("region", "none"), subset.length)} | ${percent(count("ungated", "wrong"), subset.length)} | ${percent(runs.filter((run) => run.skeleton).length, runs.length)} | ${percent(runs.filter((run) => run.structure).length, runs.length)} |`
    );
  }
  return lines.join("\n");
}

// How often each confidence band was right: the calibration behind the degradation policy.
export function bands(rows: Array<Row>): string {
  const lines = ["| Band | Groups | Correct | Wrong (if applied) |", "|---|---|---|---|"];
  for (const band of ["same", "moved", "skipped", "lost", "dropped"]) {
    const subset = rows.filter((row) => row.band === band);
    lines.push(
      `| ${band} | ${subset.length} | ${percent(subset.filter((row) => row.ungated === "correct").length, subset.length)} | ${percent(subset.filter((row) => row.ungated === "wrong").length, subset.length)} |`
    );
  }
  return lines.join("\n");
}

// Every match the matcher would make, by confidence, before any band applies: where the thresholds go.
export function calibration(rows: Array<Row>): string {
  const lines = ["| Confidence | Matched | Correct | Wrong |", "|---|---|---|---|"];
  for (let step = 0; step < 10; step += 1) {
    const subset = rows.filter(
      (row) => row.ungated !== "none" && !(row.ungated === "correct" && !row.exists) && Math.min(9, Math.floor(row.confidence * 10)) === step
    );
    if (subset.length === 0) continue;
    lines.push(
      `| ${(step / 10).toFixed(1)}–${((step + 1) / 10).toFixed(1)} | ${subset.length} | ${subset.filter((row) => row.ungated === "correct").length} | ${subset.filter((row) => row.ungated === "wrong").length} |`
    );
  }
  return lines.join("\n");
}
