import { readFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";

import { remapNodes, remapRegions, savePlan } from "../../src/shared/cache";
import type { PageScan } from "../../src/shared/types";
import { hashSeed, judge, synthesize } from "./harness";
import { MUTATIONS, flatten, rng, toTree } from "./mutate";

const SNAPSHOTS = path.resolve(import.meta.dirname, "../../../../../../evaluation/snapshots");

// One group under one change, printed: CASE="site,mutation,seed,label" npm run eval:region -- case
it.skipIf(!process.env.CASE)("one case", () => {
  const [site, mutation, seedText, label] = (process.env.CASE ?? "").split(",");
  const base = JSON.parse(readFileSync(path.join(SNAPSHOTS, site, "scan.json"), "utf8")) as PageScan;
  const groups = synthesize(base, rng(hashSeed(site)));
  const saved = savePlan({ summary: "", template: { urlPattern: `${new URL(base.url).host}/*`, pageKind: "" }, groups }, base, false, 0);
  const targets = groups.map((group, index) => ({ container: group.container, members: group.members, rows: Boolean(saved.rows?.[index]) }));
  const seed = Number(seedText);
  const mutated = flatten(MUTATIONS[mutation](toTree(base), rng(seed * 7919 + hashSeed(site + mutation)), targets), base);
  const index = groups.findIndex((group) => group.label === label);
  const group = groups[index];
  const show = (id: string | undefined, scan: PageScan) => {
    const node = scan.nodes.find((each) => each.id === id);
    return node ? `${node.id} ${node.tag}.${node.kind} p=${node.parent} ${JSON.stringify(node.rect)} ${JSON.stringify(node.attrs ?? {})} "${node.text.slice(0, 40)}"` : `${id} -`;
  };
  console.log("saved container", show(group.container, base), "members", group.members.length, group.members.slice(0, 4), "rows", saved.rows?.[index]);
  console.log("expected container", show(mutated.newId.get(group.container), mutated.scan));
  console.log("expected members", group.members.slice(0, 5).map((id) => mutated.newId.get(id)));
  const after = remapRegions(saved, mutated.scan, ["same", "moved", "skipped"]).plan.groups.find((each) => each.label === label);
  const before = remapNodes({ ...saved, regions: undefined }, mutated.scan).groups.find((each) => each.label === label);
  console.log("region", show(after?.container, mutated.scan), after?.members.slice(0, 5), judge(group, Boolean(saved.rows?.[index]), mutated, after));
  console.log("baseline", show(before?.container, mutated.scan), before?.members.slice(0, 5), judge(group, Boolean(saved.rows?.[index]), mutated, before));
  for (const id of after?.members.slice(0, 3) ?? []) console.log("  region member", show(id, mutated.scan));
});
