import { savePlan } from "../src/shared/cache";
import type { LayoutPlan } from "../src/shared/plan";
import type { TabSession } from "../src/shared/types";
import { test, expect, openWithPanel } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

// Learning that changes the page (system plan, required proof): real clicks on one product card
// of a kept layout → a suggestion in the panel → accepted → that card is emphasised on the page →
// restore leaves nothing. Scripted clicks are not counted; nothing happens before the user accepts.
test("clicks on one item lead to a suggestion that changes the page once accepted", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/catalog.html`);
  await panel.getByRole("button", { name: "Scan page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const summit = nodes.find((node) => node.text.startsWith("Summit 45"))!;
  const cards = nodes.filter((node) => node.parent === summit.parent);
  const plan: LayoutPlan = {
    summary: "Catalog",
    template: { urlPattern: "127.0.0.1:4317/*", pageKind: "catalog" },
    groups: [
      {
        label: "Backpack cards",
        urlPattern: "127.0.0.1:4317/catalog.html",
        role: "content-cards",
        container: summit.parent!,
        members: cards.map((card) => card.id),
        operation: "grid",
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
  await expect(panel.getByTestId("learning")).toBeVisible();

  const card = site.locator(".p").filter({ hasText: "Summit 45" });
  const name = card.locator(".name");

  // Off by default: clicks are not counted.
  await name.click();
  await expect(panel.getByTestId("learning-status")).toContainText("Off");

  await panel.getByText("Learn what I open on this site").click();
  await expect(panel.getByTestId("learning-status")).toContainText("0 clicks counted");

  // A scripted click is not the user's.
  await name.evaluate((element) => (element as HTMLElement).click());
  await name.click();
  await name.click();
  await expect(panel.getByTestId("learning-status")).toContainText("2 clicks counted");
  await expect(panel.getByTestId("suggestion")).toHaveCount(0);

  await name.click();
  await expect(panel.getByTestId("suggestion")).toContainText("Summit 45");
  expect(await card.getAttribute("data-smart-web-op")).toBeNull();

  await panel.getByTestId("suggestion-accept").click();
  await expect.poll(() => card.getAttribute("data-smart-web-op")).toBe("emphasize");
  await expect(panel.getByTestId("layout-applied")).toHaveText("2 changes on the page");
  await expect(panel.getByTestId("suggestion")).toHaveCount(0);

  // Decided once: more clicks don't bring the same suggestion back.
  await name.click();
  await expect(panel.getByTestId("learning-status")).toContainText("4 clicks counted");
  await expect(panel.getByTestId("suggestion")).toHaveCount(0);

  // Saved with the plan: reading the page again brings the learned emphasis back, with no model call.
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("plan-reused")).toBeVisible();
  await expect.poll(() => card.getAttribute("data-smart-web-op")).toBe("emphasize");
  await expect(panel.getByTestId("layout-applied")).toHaveText("2 changes on the page");

  await panel.getByTestId("restore-layout").click();
  await expect.poll(() => site.locator("[data-smart-web-op], [data-smart-web-member]").count()).toBe(0);
});
