import { test, expect, PAGE_TO_PAGE_URL } from "./fixtures";

test.describe("Color Boxes Functionality", () => {
  test("should add color boxes to the page when send colors button is pressed from popup (popup opened in new tab, sends to tab[0])", async ({
    page,
    extensionId,
    context,
  }) => {
    // Navigate to a test page first (this will be tab[0])
    await page.goto("https://tymonzar.ski");
    await page.waitForLoadState("networkidle");

    // Open the popup in a new tab (tab[1])
    const popupPage = await context.newPage();
    await popupPage.goto(
      `chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.POPUP}`
    );
    await popupPage.waitForLoadState("networkidle");

    // Make sure the original page is still active/focused before clicking the button
    // This is important because the popup uses chrome.tabs.query({ active: true, currentWindow: true })
    await page.bringToFront();
    await page.waitForTimeout(500);

    // Find and click the "Send Colors" button in popup
    const sendColorsButton = popupPage
      .locator("button")
      .filter({ hasText: "Send Colors" });
    await expect(sendColorsButton).toBeVisible();
    await sendColorsButton.click();

    // Wait for the message to be processed
    await page.waitForTimeout(1000);

    // Check that color boxes were added to the original page
    const colorBoxes = page.locator(".extension-color-box");
    await expect(colorBoxes).toHaveCount(4); // Based on the colors array in Popup.tsx

    // Create a screenshot of the page
    await expect(page).toHaveScreenshot("color-boxes.png");

    // Verify the color boxes have the correct styles
    const firstBox = colorBoxes.first();
    await expect(firstBox).toBeVisible();

    // Check that boxes are positioned correctly
    const boxStyles = await firstBox.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        position: styles.position,
        top: styles.top,
        left: styles.left,
        width: styles.width,
        height: styles.height,
        zIndex: styles.zIndex,
        backgroundColor: styles.backgroundColor,
      };
    });

    expect(boxStyles.position).toBe("fixed");
    expect(boxStyles.top).toBe("64px");
    expect(boxStyles.width).toBe("32px");
    expect(boxStyles.height).toBe("32px");
    expect(boxStyles.zIndex).toBe("200");

    // Close the popup
    await popupPage.close();
  });

  test("should remove color boxes when clear boxes button is pressed from popup", async ({
    page,
    extensionId,
    context,
  }) => {
    // Navigate to a test page first (this will be tab[0])
    await page.goto("https://tymonzar.ski");
    await page.waitForLoadState("networkidle");

    // Open the popup in a new tab (tab[1])
    const popupPage = await context.newPage();
    await popupPage.goto(
      `chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.POPUP}`
    );
    await popupPage.waitForLoadState("networkidle");

    // Make sure the original page is still active/focused before clicking the button
    // This is important because the popup uses chrome.tabs.query({ active: true, currentWindow: true })
    await page.bringToFront();
    await page.waitForTimeout(500);

    // First, add color boxes
    const sendColorsButton = popupPage
      .locator("button")
      .filter({ hasText: "Send Colors" });
    await expect(sendColorsButton).toBeVisible();
    await sendColorsButton.click();

    // Wait for the message to be processed
    await page.waitForTimeout(1000);

    // Verify boxes were added
    const colorBoxes = page.locator(".extension-color-box");
    await expect(colorBoxes).toHaveCount(4);

    // Now clear the boxes - make sure original page is still active
    await page.bringToFront();
    await page.waitForTimeout(500);

    const clearBoxesButton = popupPage
      .locator("button")
      .filter({ hasText: "Clear Boxes" });
    await expect(clearBoxesButton).toBeVisible();
    await clearBoxesButton.click();

    // Wait for the message to be processed
    await page.waitForTimeout(1000);

    // Verify boxes were removed
    await expect(colorBoxes).toHaveCount(0);

    // Create a snapshot of the page
    await expect(page).toHaveScreenshot("color-boxes-cleared.png");

    // Close the popup
    await popupPage.close();
  });
});
