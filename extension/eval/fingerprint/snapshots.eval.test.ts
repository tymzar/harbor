import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

import type { PageScan } from "../../src/shared/types";
import type { Cost, Row } from "./harness";
import { bands, calibration, evaluate, table } from "./harness";
import { MUTATIONS } from "./mutate";

// Offline: real page scans (evaluation/snapshots, third-party, never committed) changed by
// scan-level mutations, matched by the baseline and by region fingerprints. No network.
// npm run eval:region   (SNAPSHOTS=/path/to/snapshots to point elsewhere)
const SNAPSHOTS = process.env.SNAPSHOTS ?? path.resolve(import.meta.dirname, "../../../../../../evaluation/snapshots");
const SEEDS = [1, 2, 3];
const mutations = Object.keys(MUTATIONS);

it.skipIf(!existsSync(SNAPSHOTS))("region fingerprints vs element signatures on mutated snapshots", () => {
  const sites = readdirSync(SNAPSHOTS)
    .filter((name) => existsSync(path.join(SNAPSHOTS, name, "scan.json")))
    .toSorted();
  const rows: Array<Row> = [];
  const costs: Array<Cost> = [];
  for (const site of sites) {
    const scan = JSON.parse(readFileSync(path.join(SNAPSHOTS, site, "scan.json"), "utf8")) as PageScan;
    const result = evaluate(site, scan, mutations, SEEDS);
    rows.push(...result.rows);
    costs.push(result.cost);
  }
  // Even-numbered sites tuned the weights and thresholds; odd-numbered ones were held out.
  const tuned = new Set(sites.filter((_, index) => index % 2 === 0));
  const mean = (key: keyof Cost) => costs.reduce((sum, cost) => sum + cost[key], 0) / costs.length;
  const max = (key: keyof Cost) => Math.max(...costs.map((cost) => cost[key]));
  const report = [
    `Sites: ${sites.length}; groups: ${rows.length / mutations.length / SEEDS.length}; seeds: ${SEEDS.length}`,
    "",
    "All sites",
    table(rows, mutations),
    "",
    "Held-out sites only",
    table(rows.filter((row) => !tuned.has(row.site)), mutations),
    "",
    "Bands (all sites, all changes)",
    bands(rows),
    "",
    "Calibration: every match by confidence (tuned sites)",
    calibration(rows.filter((row) => tuned.has(row.site))),
    "",
    "Calibration (held-out sites)",
    calibration(rows.filter((row) => !tuned.has(row.site))),
    "",
    `Cost: save ${mean("saveMs").toFixed(2)} ms mean (max ${max("saveMs").toFixed(2)}); remap ${mean("remapMs").toFixed(2)} ms mean (max ${max("remapMs").toFixed(2)}); baseline remap ${mean("baselineMs").toFixed(2)} ms; saved plan ${Math.round(mean("legacyBytes"))} B → ${Math.round(mean("regionBytes"))} B mean (max ${max("regionBytes")} B); scan ${Math.round(mean("nodes"))} nodes mean`,
  ].join("\n");
  const gone = rows.filter((row) => !row.exists);
  const goneLine = `Groups whose region was gone (redesigned, or its only row removed): ${gone.length}; applied anyway (wrong): baseline ${gone.filter((row) => row.baseline === "wrong").length}, region ${gone.filter((row) => row.region === "wrong").length}`;
  console.log(`${report}\n${goneLine}`);
  if (process.env.DEBUG)
    for (const row of rows.filter((each) => each[process.env.DEBUG as "region"] !== "correct"))
      console.log(row.site, row.mutation, row.seed, row.label, row.operation, `baseline=${row.baseline} region=${row.region} band=${row.band} ${row.confidence}`, row.detail ? `\n${row.detail}` : "");
  writeFileSync(path.join(import.meta.dirname, "results-snapshots.md"), `${report}\n${goneLine}\n`);
  // Aggregates only: per-group rows name third-party sites and stay local.
  expect(rows.length).toBeGreaterThan(0);
});
