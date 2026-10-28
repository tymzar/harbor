import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { NodeKind, TabSession } from "../src/shared/types";
import { test, expect, openWithPanel } from "./fixtures";

// Collects what the extension sees on real sites, for the evaluation set in ../evaluation.
// No model calls. Only with COLLECT=1 (it visits third-party sites).
test.skip(!process.env.COLLECT, "set COLLECT=1 to visit the evaluation sites");
test.setTimeout(120_000);

type Site = { id: string; name: string; kind: string; url: string };

const ROOT = path.resolve("../evaluation");
const sites = JSON.parse(readFileSync(path.join(ROOT, "sites.json"), "utf8")) as Array<Site>;
const only = process.env.SITES?.split(",");

// Cookie and consent walls: answer the way a privacy-minded user would, rejecting first.
const REJECT = /^(reject all|reject|decline|decline optional cookies|only necessary|necessary only|use necessary cookies only|refuse all)$/i;
const ACCEPT = /^(accept all|accept|i agree|agree|allow all|accept all cookies|accept cookies|ok)$/i;
const BLOCKERS: Array<[string, RegExp]> = [
  ["login-wall", /\b(sign in to|log in to|join now to|sign up to see|create an account to)\b/i],
  ["captcha", /\b(captcha|are you a robot|verify you are human|unusual traffic)\b/i],
  ["access-denied", /\b(access denied|forbidden|request blocked)\b/i],
  ["consent-wall", /\b(before you continue|we value your privacy|cookie preferences)\b/i],
];

for (const site of sites.filter((candidate) => !only || only.includes(candidate.id))) {
  test(`collect ${site.id}`, async ({ context, extensionId }) => {
    const started = Date.now();
    const { site: page, panel, tabId } = await openWithPanel(context, extensionId, site.url);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2500);

    let consent: string | undefined;
    for (const pattern of [REJECT, ACCEPT]) {
      // Match the visible label: some walls give buttons a long accessible name (YouTube's
      // "Reject all" is named "Reject the use of cookies and other data...").
      const button = page.locator("button, [role=button]").filter({ hasText: pattern }).first();
      if (await button.isVisible().catch(() => false)) {
        consent = `${(await button.innerText()).trim()} (${pattern === REJECT ? "reject" : "accept"})`;
        await button.click().catch(() => {});
        await page.waitForTimeout(2000);
        break;
      }
    }
    const loadMs = Date.now() - started;

    await panel.getByRole("button", { name: /^(Scan page|Rescan)$/ }).click();
    await expect(panel.getByTestId("node-count").or(panel.getByTestId("scan-error"))).toBeVisible({ timeout: 30_000 });
    const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
    const scan = session.scan;

    const bodyText = await page.evaluate(() => document.body?.innerText.slice(0, 4000) ?? "");
    const blockers = BLOCKERS.filter(([, pattern]) => pattern.test(bodyText)).map(([name]) => name);
    const kinds: Partial<Record<NodeKind, number>> = {};
    for (const node of scan?.nodes ?? []) kinds[node.kind] = (kinds[node.kind] ?? 0) + 1;

    const out = path.join(ROOT, "snapshots", site.id);
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
