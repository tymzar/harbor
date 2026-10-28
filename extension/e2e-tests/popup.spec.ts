import { test, expect, PAGE_TO_PAGE_URL } from "./fixtures";

test("should open the popup", async ({ page, extensionId }) => {
  await page.goto(
    `chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.POPUP}`
  );

  const extensionPopupTitle = page.locator(
    "[data-testid='extension-popup-title']"
  );

  await expect(extensionPopupTitle).toBeVisible();

  await expect(extensionPopupTitle).toHaveText("Extension Popup");
});
