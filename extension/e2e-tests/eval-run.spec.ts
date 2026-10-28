import type { Page, Worker } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { judge, resolveAnchor } from "../src/shared/anchors";
import type { Anchor, Observation, Scenario, Verdict } from "../src/shared/anchors";
import type { PanelRequest, TabSession } from "../src/shared/types";
import { test, expect } from "./fixtures";
import { EVALUATION, SITES, openSite, readSession } from "./fixtures/sites";
import type { Site } from "./fixtures/sites";

// Runs the evaluation set (../evaluation/scenarios.json) through the extension on the real sites:
// scan, ask for a plan with the scenario's goal, apply every proposed change, then check each
// expected outcome on the live page. Goal scenarios run without and then with the screenshot, on
// the same scan. Picker scenarios hide the picked element; they make no model calls.
// Real Meta calls through the local proxy: only with EVAL=1. Results go to evaluation/runs/<run>/;
// summarise them with  node evaluation/score.ts <run>.
test.skip(!process.env.EVAL, "set EVAL=1 with the proxy running to run the evaluation set");
test.setTimeout(600_000);

type Mode = "dom-only" | "dom+sam";

const EFFORT = process.env.SMART_WEB_REASONING_EFFORT ?? "low";
const RUN = process.env.EVAL_RUN ?? `${new Date().toISOString().slice(0, 10)}-effort-${EFFORT}`;
const OUT = path.join(EVALUATION, "runs", RUN);
const MODES = (process.env.MODES?.split(",") ?? ["dom-only", "dom+sam"]) as Array<Mode>;
const only = process.env.SCENARIOS?.split(",");

const scenarios = (JSON.parse(readFileSync(path.join(EVALUATION, "scenarios.json"), "utf8")) as Array<Scenario>).filter(
  (scenario) => scenario.requires !== "real-browser" && (!only || only.includes(scenario.id))
);

async function send(panel: Page, request: PanelRequest) {
  await panel.evaluate((message) => chrome.runtime.sendMessage(message), request);
}

// Waits until the session satisfies the condition; returns it.
async function waitFor(panel: Page, tabId: number, done: (session: TabSession) => boolean, timeout: number) {
  let latest: TabSession | undefined;
  await expect
    .poll(async () => {
      latest = await readSession(panel, tabId);
      return latest ? done(latest) : false;
    }, { timeout, intervals: [250, 500, 1000] })
    .toBe(true);
  return latest!;
}

async function inspect(worker: Worker, tabId: number, ids: Array<string>): Promise<Array<Observation>> {
  return worker.evaluate(
    async ({ tabId, ids }) => {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (nodeIds: Array<string>) => globalThis.smartWeb!.inspect(nodeIds),
        args: [ids],
      });
      return injection.result!;
    },
    { tabId, ids }
  );
}

// Changes the layout and waits for the background to record it.
async function layout(panel: Page, tabId: number, action: "apply" | "restore") {
  const sentAt = Date.now();
  await send(panel, { type: "layout", tabId, action });
  return waitFor(panel, tabId, (session) => session.updatedAt >= sentAt, 30_000);
}

const NOT_FOUND: Observation = { found: false, visible: false, ops: [], coveringOps: [] };

// One site at a time per worker: visiting a site from several browsers at once got bot checks
// (Amazon, Stack Overflow) in the first run. Other sites run alongside.
for (const site of SITES.filter((candidate) => scenarios.some((scenario) => scenario.site === candidate.id)))
  test.describe(site.id, () => {
    test.describe.configure({ mode: "default" });
    for (const scenario of scenarios.filter((candidate) => candidate.site === site.id)) defineScenario(site, scenario);
  });

function defineScenario(site: Site, scenario: Scenario) {
  test(`eval ${scenario.id}`, async ({ context, extensionId }) => {
    const { site: page, panel, tabId, consent } = await openSite(context, extensionId, site);
    const [worker] = context.serviceWorkers();

    const scanSentAt = Date.now();
    await send(panel, { type: "rescan", tabId });
    const scanned = await waitFor(panel, tabId, (session) => session.updatedAt >= scanSentAt && session.status !== "scanning", 60_000);
    expect(scanned.status, scanned.error).toBe("ready");
    const scan = scanned.scan!;

    // Anchors resolve against this visit's scan: the site may have changed since the snapshot.
    const anchors: Array<Anchor> = [...(scenario.pick ? [scenario.pick] : []), ...scenario.expect.map((item) => item.anchor)];
    const resolved = anchors.map((anchor) => resolveAnchor(scan.nodes, anchor));
    const ids = resolved.flatMap((found) => (found.node ? [found.node.id] : []));
    const observe = async () => {
      const seen = await inspect(worker, tabId, ids);
      return resolved.map((found) => (found.node ? seen[ids.indexOf(found.node.id)] : NOT_FOUND));
    };
    const offset = scenario.pick ? 1 : 0;
    const before = await observe();
    const verdicts = (after: Array<Observation>): Array<Verdict> =>
      scenario.expect.map((item, index) => judge(item.op, before[index + offset], after[index + offset]));

    const shots = path.join(OUT, "shots");
    mkdirSync(shots, { recursive: true });
    const runs: Array<Record<string, unknown>> = [];

    if (scenario.pick) {
      const nodeId = resolved[0].node?.id;
      if (nodeId) {
        const sentAt = Date.now();
        await send(panel, { type: "hide-node", tabId, nodeId });
        const session = await waitFor(panel, tabId, (current) => current.updatedAt >= sentAt, 30_000);
        const after = await observe();
        await page.screenshot({ path: path.join(shots, `${scenario.id}-picker.jpg`), type: "jpeg", quality: 60 });
        runs.push({ mode: "picker", layout: session.layout, notice: session.notice, error: session.error, after, verdicts: verdicts(after) });
      } else runs.push({ mode: "picker", error: "The picked element is not on the page.", verdicts: verdicts(before.map(() => NOT_FOUND)) });
    }

    // Nothing the scenario names is on the page: a bot check or a different page. Asking for a plan
    // would cost tokens and score nothing.
    const absent = scenario.expect.every((_, index) => !resolved[index + offset].node);
    if (absent && scenario.goal)
      for (const mode of MODES)
        runs.push({ mode, error: "None of the scenario's elements are on the page.", verdicts: verdicts(before.map(() => NOT_FOUND)) });

    for (const mode of scenario.goal && !absent ? MODES : []) {
      const sentAt = Date.now();
      await send(panel, { type: "propose", tabId, includeScreenshot: mode === "dom+sam", goal: scenario.goal });
      const proposed = await waitFor(
        panel,
        tabId,
        (session) =>
          session.scan?.scannedAt !== scan.scannedAt ||
          ((session.proposal?.startedAt ?? 0) >= sentAt && session.proposal?.status !== "running"),
        540_000
      );
      // The site navigated (Stack Overflow rewrites its URL) and the extension read the page again,
      // dropping this plan; the scenario is reported as rescanned.
      if (proposed.scan?.scannedAt !== scan.scannedAt) break;
      const proposal = proposed.proposal!;
      const applied = await layout(panel, tabId, "apply");
      const after = await observe();
      await page.screenshot({ path: path.join(shots, `${scenario.id}-${mode}.jpg`), type: "jpeg", quality: 60 });
      await layout(panel, tabId, "restore");
      runs.push({
        mode,
        proposal: {
          status: proposal.status,
          error: proposal.error,
          usedScreenshot: proposal.usedScreenshot,
          plan: proposal.plan,
          accepted: proposal.accepted,
          errors: proposal.errors,
          repaired: proposal.repaired,
          calls: proposal.calls,
          ms: (proposal.finishedAt ?? Date.now()) - proposal.startedAt,
        },
        layout: applied.layout,
        notice: applied.notice,
        error: applied.error,
        after,
        verdicts: verdicts(after),
      });
    }

    // A rescan mid-run (the site navigated) renumbers elements; observations after it mean nothing.
    const final = await readSession(panel, tabId);
    const rescanned = final?.scan?.scannedAt !== scan.scannedAt;

    writeFileSync(
      path.join(OUT, `${scenario.id}.json`),
      JSON.stringify(
        {
          scenario,
          site: { id: site.id, url: site.url, finalUrl: page.url(), consent },
          at: new Date().toISOString(),
          scanNodes: scan.nodes.length,
          rescanned,
          anchors: anchors.map((anchor, index) => {
            const { node, matches } = resolved[index];
            return { anchor, matches, node: node && { id: node.id, tag: node.tag, kind: node.kind, text: node.text.slice(0, 80) } };
          }),
          before,
          // The page as the site serves it, scored the same way: the "do nothing" baseline.
          baseline: verdicts(before),
          runs,
        },
        undefined,
        2
      )
    );
    expect(rescanned, "the page was rescanned during the run").toBe(false);
  });
}
