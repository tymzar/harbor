import { test, expect, PAGE_TO_PAGE_URL } from "./fixtures";

test("should open the new tab page", async ({ page, extensionId }) => {
  await page.goto(
    `chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.NEWTAB}`
  );

  const newTabTitle = page.locator("[data-testid='extension-newtab-title']");

  await expect(newTabTitle).toBeVisible();
  await expect(newTabTitle).toHaveText("Extension New Tab");
});
