import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { NodeKind } from "../src/shared/types";
import { test, expect } from "./fixtures";
import { EVALUATION, SITES, openSite, readSession } from "./fixtures/sites";

// Collects what the extension sees on real sites, for the evaluation set in ../evaluation.
// No model calls. Only with COLLECT=1 (it visits third-party sites).
test.skip(!process.env.COLLECT, "set COLLECT=1 to visit the evaluation sites");
test.setTimeout(120_000);

const only = process.env.SITES?.split(",");

const BLOCKERS: Array<[string, RegExp]> = [
  ["login-wall", /\b(sign in to|log in to|join now to|sign up to see|create an account to)\b/i],
  ["captcha", /\b(captcha|are you a robot|verify you are human|unusual traffic)\b/i],
  ["access-denied", /\b(access denied|forbidden|request blocked)\b/i],
  ["consent-wall", /\b(before you continue|we value your privacy|cookie preferences)\b/i],
];

for (const site of SITES.filter((candidate) => !only || only.includes(candidate.id))) {
  test(`collect ${site.id}`, async ({ context, extensionId }) => {
    const { site: page, panel, tabId, consent, loadMs } = await openSite(context, extensionId, site);

    await panel.getByRole("button", { name: /^(Read this page|Rescan)$/ }).click();
    await expect(panel.getByTestId("node-count").or(panel.getByTestId("scan-error"))).toBeVisible({ timeout: 30_000 });
    const session = (await readSession(panel, tabId))!;
    const scan = session.scan;

    const bodyText = await page.evaluate(() => document.body?.innerText.slice(0, 4000) ?? "");
    const blockers = BLOCKERS.filter(([, pattern]) => pattern.test(bodyText)).map(([name]) => name);
    const kinds: Partial<Record<NodeKind, number>> = {};
    for (const node of scan?.nodes ?? []) kinds[node.kind] = (kinds[node.kind] ?? 0) + 1;

    const out = path.join(EVALUATION, "snapshots", site.id);
    mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, "page.jpg"), type: "jpeg", quality: 60 });
    if (scan) writeFileSync(path.join(out, "scan.json"), JSON.stringify(scan, undefined, 1));
    const meta = {
      ...site,
      finalUrl: page.url(),
      title: await page.title(),
      collectedAt: new Date().toISOString(),
      loadMs,
      consent,
      blockers,
      status: session.status,
      error: session.error,
      nodes: scan?.nodes.length ?? 0,
      kinds,
      truncated: scan?.truncated,
      skipped: scan?.skipped,
      viewport: scan?.viewport,
    };
    writeFileSync(path.join(out, "meta.json"), JSON.stringify(meta, undefined, 2));
    console.log(`COLLECTED ${site.id} status=${meta.status} nodes=${meta.nodes} consent=${consent ?? "-"} blockers=${blockers.join("|") || "-"} title="${meta.title.slice(0, 60)}"`);
  });
}
