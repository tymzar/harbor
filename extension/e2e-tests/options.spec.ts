import { test, expect, PAGE_TO_PAGE_URL } from "./fixtures";

test("should open the options page", async ({ page, extensionId }) => {
  await page.goto(
    `chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.OPTIONS}`
  );

  const optionsTitle = page.locator("[data-testid='extension-options-title']");

  await expect(optionsTitle).toBeVisible();
  await expect(optionsTitle).toHaveText("Settings");
});
