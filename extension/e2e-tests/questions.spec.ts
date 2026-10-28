import { savePlan } from "../src/shared/cache";
import type { LayoutPlan, PlanGroup } from "../src/shared/plan";
import type { TabSession } from "../src/shared/types";
import { test, expect, openWithPanel } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

// Spark's follow-up questions: an answer changes the plan locally, a live preview follows it,
// and the answer is kept with the saved plan.
test("answering a question changes the plan and the page", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/docs.html`);
  await panel.getByRole("button", { name: "Scan page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const matches = nodes.filter((node) => /^(Rotate keys|Scopes|OAuth apps|Rate limits) /.test(node.text));
  const tiles = matches.filter((node) => matches.some((other) => other.id === node.parent));
  const toc = nodes.find((node) => node.text.startsWith("On this page"))!;
  const group = (label: string, container: string, members: Array<string>): PlanGroup => ({
    label,
    urlPattern: "127.0.0.1:4317/docs.html",
    role: "other",
    container,
    members,
    operation: "none",
    reorderable: false,
    identity: { source: "none", attribute: "" },
    reason: "",
  });
  const plan: LayoutPlan = {
    summary: "Docs page",
    template: { urlPattern: "127.0.0.1:4317/docs.html", pageKind: "docs" },
    groups: [
      group("Next steps cards", tiles[0].parent!, tiles.map((tile) => tile.id)),
      group("On this page", toc.id, nodes.filter((node) => node.parent === toc.id && node.tag === "a").map((node) => node.id)),
    ],
    questions: [
      {
        id: "task",
        text: "What do you come here for?",
        multiple: false,
        options: [
          { label: "Start building", effects: [{ group: "Next steps cards", operation: "grid" }] },
          { label: "Look things up", effects: [{ group: "On this page", operation: "emphasize" }] },
        ],
      },
    ],
  };
  await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
  await panel.getByRole("button", { name: "Rescan" }).click();

  // Nothing to preview until a question is answered.
  await expect(panel.getByTestId("question")).toHaveText(/What do you come here for\?/);
  await expect(panel.getByTestId("no-changes")).toBeVisible();

  const option = (name: string) => panel.getByTestId("question").getByRole("button", { name });
  await option("Start building").click();
  await expect(option("Start building")).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByTestId("plan-group").filter({ hasText: "Next steps cards" })).toContainText("grid");
  if (process.env.SHOT) await panel.getByTestId("plan-card").screenshot({ path: process.env.SHOT });

  const display = () => site.locator(".grid").evaluate((element) => getComputedStyle(element).display);
  const tocMarked = () => site.locator(".toc").evaluate((element) => element.getAttribute("data-smart-web-op"));
  await panel.getByTestId("preview-layout").click();
  await expect.poll(display).toBe("grid");

  // Changing the answer during preview moves the change on the page.
  await option("Look things up").click();
  await expect.poll(tocMarked).toBe("emphasize");
  await expect.poll(display).toBe("flex");
  await panel.getByTestId("keep-layout").click();
  await expect(panel.getByTestId("layout-applied")).toHaveText("1 change on the page");

  // The answer and the layout survive a rescan (wait for the new scan, not the old panel state).
  const scannedAt = async () =>
    ((await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession)
      .scan?.scannedAt ?? 0;
  const lastScan = await scannedAt();
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect.poll(scannedAt).toBeGreaterThan(lastScan);
  await expect(option("Look things up")).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByTestId("layout-applied")).toBeVisible();
  await expect.poll(tocMarked).toBe("emphasize");
});
