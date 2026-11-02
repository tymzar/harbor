import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { expect, it } from "vitest";

import type { PageScan } from "../../src/shared/types";
import type { Row } from "./harness";
import { bands, compare, prepare, table, totals } from "./harness";
import type { Mutated } from "./mutate";

// Real DOM, real scanner: the owned fixtures are opened in Chromium, changed in the DOM
// (dom-mutate.ts), and read with the extension's scanPage. Ground truth travels on the elements.
// No network: pages are opened from disk.
const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");
const PAGES = ["catalog.html", "docs.html", "feed.html"];
const SEEDS = [1, 2, 3];

type Read = { scan: PageScan; origin: Array<string | undefined>; cloneOf: Array<string | undefined>; sameAs: Array<string | undefined> };

it("region fingerprints vs element signatures on mutated fixtures (real DOM)", async () => {
  const bundle = await build({ entryPoints: [path.join(import.meta.dirname, "scan-entry.ts")], bundle: true, format: "iife", write: false, target: "chrome120" });
  const code = bundle.outputFiles[0].text;
  const browser = await chromium.launch();
  const rows: Array<Row> = [];
  let mutations: Array<string> = [];
  try {
    for (const file of PAGES) {
      const url = `https://fixtures.example/${file}`;
      const read = async (width: number, change?: { name: string; seed: number; targets: Array<string> }): Promise<Read> => {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        await page.goto(pathToFileURL(path.join(FIXTURES, file)).href);
        await page.addScriptTag({ content: code });
        await page.evaluate(() => globalThis.fpMark());
        mutations = await page.evaluate(() => globalThis.fpMutations);
        if (change) await page.evaluate(({ name, seed, targets }) => globalThis.fpMutate(name, seed, targets), change);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const result = (await page.evaluate(() => globalThis.fpScan())) as Read;
        await page.close();
        return { ...result, scan: { ...result.scan, url } };
      };

      const base = await read(1280);
      const prepared = prepare(file, base.scan);
      const oldByOrigin = new Map(base.scan.nodes.flatMap((node, index) => (base.origin[index] ? [[base.origin[index]!, node.id] as const] : [])));
      const targets = prepared.groups.flatMap((group) => base.origin[base.scan.nodes.findIndex((node) => node.id === group.container)] ?? []);
      for (const name of mutations)
        for (const seed of SEEDS) {
          const after = await read(name === "viewport" ? 1024 : 1280, { name, seed, targets });
          const mutated: Mutated = { scan: after.scan, newId: new Map(), clones: new Map(), sameAs: new Map(), removed: new Set() };
          for (const [index, node] of after.scan.nodes.entries()) {
            const old = after.origin[index] && oldByOrigin.get(after.origin[index]!);
            if (old) mutated.newId.set(old, node.id);
            const copied = after.cloneOf[index] && oldByOrigin.get(after.cloneOf[index]!);
            if (copied) mutated.clones.set(copied, [...(mutated.clones.get(copied) ?? []), node.id]);
            const same = after.sameAs[index] && oldByOrigin.get(after.sameAs[index]!);
            if (same) mutated.sameAs.set(node.id, same);
          }
          rows.push(...compare(prepared, mutated, name, seed).rows);
        }
    }
  } finally {
    await browser.close();
  }
  const groups = rows.length / mutations.length / SEEDS.length;
  const gone = rows.filter((row) => !row.exists);
  const report = [
    `Fixtures: ${PAGES.length}; groups: ${groups}; seeds: ${SEEDS.length}`,
    "",
    table(rows, mutations),
    totals(rows),
    "",
    bands(rows),
    "",
    `Groups whose region was gone: ${gone.length}; applied anyway (wrong): baseline ${gone.filter((row) => row.baseline === "wrong").length}, region ${gone.filter((row) => row.region === "wrong").length}`,
  ].join("\n");
  console.log(report);
  if (process.env.DEBUG)
    for (const row of rows.filter((each) => each[process.env.DEBUG as "region"] !== "correct"))
      console.log(row.site, row.mutation, row.seed, row.label, row.operation, `baseline=${row.baseline} region=${row.region} band=${row.band} ${row.confidence}`, row.detail ? `\n${row.detail}` : "");
  writeFileSync(path.join(import.meta.dirname, "results-fixtures.md"), `${report}\n`);
  expect(rows.length).toBeGreaterThan(0);
});
