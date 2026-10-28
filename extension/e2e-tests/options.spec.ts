import type { SavedPlan } from "../src/shared/cache";
import { test, expect, PAGE_TO_PAGE_URL } from "./fixtures";

// Shaped like the plan the user saved from a GitHub repository on 28 Oct.
const saved: SavedPlan = {
  url: "https://github.com/tymzar/starter-web-extension",
  usedScreenshot: true,
  savedAt: Date.parse("2026-10-28T10:00:00Z"),
  signatures: {},
  plan: {
    summary: "GitHub repo code page: keep tabs and file list, tighten header actions",
    template: { urlPattern: "github.com/{owner}/{repo}/*", pageKind: "repository" },
    groups: [
      {
        label: "Repository tabs",
        urlPattern: "github.com/{owner}/{repo}/*",
        role: "tabs",
        container: "n1",
        members: ["n2", "n3"],
        operation: "none",
        reorderable: true,
        identity: { source: "attribute", attribute: "data-tab-item" },
        reason: "",
      },
      {
        label: "Languages breakdown",
        urlPattern: "github.com/{owner}/{repo}",
        role: "list",
        container: "n4",
        members: ["n5"],
        operation: "hide-secondary",
        reorderable: false,
        identity: { source: "none", attribute: "" },
        reason: "",
      },
    ],
  },
};

test("settings page lists saved layouts and forgets them", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.OPTIONS}`);
  await expect(page.getByTestId("no-saved-plans")).toBeVisible();

  await page.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), saved);
  const row = page.getByTestId("saved-plan");
  await expect(row).toContainText("github.com/{owner}/{repo}/*");
  await row.getByRole("button", { name: "Show 2 groups" }).click();
  await expect(row).toContainText("reorderable by data-tab-item");
  await expect(row).toContainText("hide-secondary");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

  await row.getByRole("button", { name: /Forget the plan/ }).click();
  await expect(page.getByTestId("no-saved-plans")).toBeVisible();
  expect(await page.evaluate(() => chrome.storage.local.get("savedPlans"))).toEqual({ savedPlans: [] });
});
