import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { TabSession } from "../src/shared/types";
import { test, expect, PAGE_TO_PAGE_URL } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

// Real Meta calls through the local proxy: costs credits, so only with LIVE=1.
// Each run writes the full proposal (plan, validator result, call timings) to evidence/.
test.skip(!process.env.LIVE, "set LIVE=1 with the proxy running to call Meta");
test.setTimeout(240_000);

const EFFORT = process.env.SMART_WEB_REASONING_EFFORT;
const EVIDENCE = path.resolve(`../evidence/day2${EFFORT ? `-effort-${EFFORT}` : ""}`);

for (const fixture of ["docs.html", "catalog.html"]) {
  for (const includeScreenshot of [false, true]) {
    const mode = includeScreenshot ? "dom+sam" : "dom-only";

    test(`live plan for ${fixture} (${mode})`, async ({ context, extensionId }) => {
      const site = await context.newPage();
      await site.goto(`${FIXTURE_ORIGIN}/${fixture}`);
      const [worker] = context.serviceWorkers();
      const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, site.url());

      const panelUrl = `chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.SIDEPANEL}?tabId=${tabId}`;
      const [panel] = await Promise.all([
        context.waitForEvent("page", (page) => page.url().startsWith(panelUrl)),
        worker.evaluate((url) => chrome.windows.create({ url, width: 440, height: 1000 }), panelUrl),
      ]);

      await panel.getByRole("button", { name: "Scan page" }).click();
      await expect(panel.getByTestId("screenshot")).toBeVisible();

      if (includeScreenshot) await panel.getByText("Also send the screenshot").click();
      await panel.getByTestId("send-plan").click();
      await expect(panel.getByTestId("plan-result").or(panel.getByTestId("plan-error"))).toBeVisible({
        timeout: 220_000,
      });

      const session = await panel.evaluate(async (key) => {
        const stored = await chrome.storage.session.get(key);
        return stored[key];
      }, `session:${tabId}`) as TabSession;
      const proposal = session.proposal!;

      mkdirSync(EVIDENCE, { recursive: true });
      const name = `${fixture.replace(".html", "")}-${mode}`;
      writeFileSync(
        path.join(EVIDENCE, `${name}.json`),
        JSON.stringify({ fixture, mode, at: new Date().toISOString(), scanNodes: session.scan!.nodes.length, proposal }, undefined, 2)
      );
      await panel.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });

      expect(proposal.status, proposal.error).toBe("done");
      expect(proposal.usedScreenshot).toBe(includeScreenshot);
      expect(proposal.accepted!.length).toBeGreaterThan(0);
    });
  }
}
