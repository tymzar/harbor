import { test, expect, PAGE_TO_PAGE_URL } from "./fixtures";

test("should open the panel page", async ({ page, extensionId }) => {
  await page.goto(
    `chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.PANEL}`
  );

  const panelTitle = page.locator("[data-testid='extension-panel-title']");

  await expect(panelTitle).toBeVisible();
  await expect(panelTitle).toHaveText("Extension Panel");
});
