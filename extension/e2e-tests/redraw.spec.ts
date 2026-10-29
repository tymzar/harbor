import { savePlan } from "../src/shared/cache";
import type { LayoutPlan } from "../src/shared/plan";
import type { TabSession } from "../src/shared/types";
import { test, expect, openWithPanel } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

// Single-page apps replace whole regions when they re-render. A kept layout comes back on the new
// elements from the saved plan, with no model call; a page that keeps redrawing gets a notice
// instead of an endless loop.
test("a kept layout is re-applied when the site redraws the region", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/feed.html`);
  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const trending = nodes.find((node) => node.tag === "aside")!;
  const plan: LayoutPlan = {
    summary: "Community feed",
    template: { urlPattern: "127.0.0.1:4317/feed.html", pageKind: "feed" },
    groups: [
      {
        label: "Trending sidebar",
        urlPattern: "127.0.0.1:4317/feed.html",
        role: "sidebar",
        container: trending.id,
        members: nodes.filter((node) => node.parent === trending.id).map((node) => node.id),
        operation: "hide-secondary",
        reorderable: false,
        identity: { source: "none", attribute: "" },
        reason: "",
      },
    ],
  };
  await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("plan-reused")).toBeVisible();
  await panel.getByTestId("preview-layout").click();
  await panel.getByTestId("keep-layout").click();

  const sidebar = site.locator("#trending");
  await expect(sidebar).toBeHidden();

  // The site swaps in a new sidebar element: hidden again once the page settles.
  await site.getByRole("button", { name: "Refresh trending" }).click();
  await expect(sidebar).toContainText("· 2");
  await expect(sidebar).toBeHidden({ timeout: 10_000 });
  await expect(panel.getByTestId("layout-applied")).toBeVisible();

  // Five re-applies in half a minute is the limit; the sixth redraw gets a notice instead.
  for (let round = 3; round <= 7; round += 1) {
    await site.getByRole("button", { name: "Refresh trending" }).click();
    if (round <= 6) await expect(sidebar).toBeHidden({ timeout: 10_000 });
  }
  await expect(panel.getByTestId("notice")).toContainText("keeps redrawing", { timeout: 10_000 });
  await expect(sidebar).toBeVisible();
});
