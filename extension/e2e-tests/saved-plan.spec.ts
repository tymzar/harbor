import { savePlan } from "../src/shared/cache";
import type { LayoutPlan } from "../src/shared/plan";
import type { TabSession } from "../src/shared/types";
import { test, expect, PAGE_TO_PAGE_URL } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

// A plan saved earlier comes back on the next scan without any model call, and Forget removes it.
test("a saved plan is reused after a rescan and can be forgotten", async ({ context, extensionId }) => {
  const site = await context.newPage();
  await site.goto(`${FIXTURE_ORIGIN}/docs.html`);
  const [worker] = context.serviceWorkers();
  const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, site.url());

  const panelUrl = `chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.SIDEPANEL}?tabId=${tabId}`;
  const [panel] = await Promise.all([
    context.waitForEvent("page", (page) => page.url().startsWith(panelUrl)),
    worker.evaluate((url) => chrome.windows.create({ url }), panelUrl),
  ]);
  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  const session = (await panel.evaluate(async (key) => {
    const stored = await chrome.storage.session.get(key);
    return stored[key];
  }, `session:${tabId}`)) as TabSession;
  const scan = session.scan!;

  // The four "Next steps" tiles, as a model might have grouped them.
  const matches = scan.nodes.filter((node) => /^(Rotate keys|Scopes|OAuth apps|Rate limits) /.test(node.text));
  // The row's container text starts with the first tile too; keep the tiles inside it.
  const tiles = matches.filter((node) => matches.some((other) => other.id === node.parent));
  expect(tiles).toHaveLength(4);
  const plan: LayoutPlan = {
    summary: "Docs page with a card row",
    template: { urlPattern: "127.0.0.1:4317/docs.html", pageKind: "docs" },
    groups: [
      {
        label: "Next steps cards",
        urlPattern: "127.0.0.1:4317/docs.html",
        role: "content-cards",
        container: tiles[0].parent!,
        members: tiles.map((tile) => tile.id),
        operation: "grid",
        reorderable: false,
        identity: { source: "none", attribute: "" },
        reason: "seeded by test",
      },
    ],
  };
  await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, scan, false, Date.now()));

  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("plan-reused")).toBeVisible();
  await expect(panel.getByTestId("plan-group")).toHaveText(/Next steps cards/);
  await expect(panel.getByTestId("plan-calls")).toHaveCount(0);

  await panel.getByTestId("forget-plan").click();
  await expect(panel.getByTestId("plan-reused")).toHaveCount(0);
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();
  await expect(panel.getByTestId("plan-reused")).toHaveCount(0);
  expect(await panel.evaluate(() => chrome.storage.local.get("savedPlans"))).toEqual({ savedPlans: [] });
});
