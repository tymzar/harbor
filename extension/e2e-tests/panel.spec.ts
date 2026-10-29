import type { BrowserContext, Page } from "@playwright/test";
import { test, expect, PAGE_TO_PAGE_URL } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

// Opens a fixture in its own window and the panel in another, pinned to the fixture's tab,
// so the fixture stays the visible tab that captureVisibleTab photographs.
async function openFixtureWithPanel(
  context: BrowserContext,
  extensionId: string,
  fixture: string
): Promise<{ site: Page; panel: Page }> {
  const site = await context.newPage();
  await site.goto(`${FIXTURE_ORIGIN}/${fixture}`);

  const [worker] = context.serviceWorkers();
  const tabId = await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return tab.id;
  }, site.url());

  const panelUrl = `chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.SIDEPANEL}?tabId=${tabId}`;
  const [panel] = await Promise.all([
    context.waitForEvent("page", (page) => page.url().startsWith(panelUrl)),
    worker.evaluate((url) => chrome.windows.create({ url, width: 420, height: 900 }), panelUrl),
  ]);
  await panel.waitForLoadState();
  return { site, panel };
}

test("side panel renders with HeroUI v3 styles", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.SIDEPANEL}`);

  await expect(page.getByTestId("extension-panel-title")).toHaveText("Harbor");
  const scanButton = page.getByRole("button", { name: "Read this page" });
  await expect(scanButton).toBeVisible();

  // Primary buttons take the accent colour only if Tailwind + @heroui/styles were bundled.
  const background = await scanButton.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
});

for (const fixture of ["docs.html", "catalog.html"]) {
  test(`scans ${fixture}: elements, screenshot, no form text`, async ({ context, extensionId }) => {
    const { panel } = await openFixtureWithPanel(context, extensionId, fixture);

    await panel.getByRole("button", { name: "Read this page" }).click();

    await expect(panel.getByTestId("screenshot")).toBeVisible();
    const count = Number(await panel.getByTestId("node-count").textContent());
    expect(count).toBeGreaterThan(20);

    // Search boxes are read as present but their contents are never shown or kept.
    // The element list is collapsed by default.
    await panel.getByTestId("element-list").getByText(/^All \d+ elements on this page$/).click();
    await expect(panel.getByTestId("scan-node").filter({ hasText: "Form field, content not read" })).not.toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Rescan" })).toBeVisible();
  });
}

test("restricted pages are reported, not scanned", async ({ context, extensionId }) => {
  const settings = await context.newPage();
  await settings.goto("chrome://version");
  const [worker] = context.serviceWorkers();
  // URL patterns can't match chrome:// pages; it is the tab just opened, so take the newest.
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return Math.max(...tabs.map((tab) => tab.id ?? 0));
  });

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.SIDEPANEL}?tabId=${tabId}`);
  await panel.getByRole("button", { name: "Read this page" }).click();

  await expect(panel.getByText("Chrome doesn't allow extensions here")).toBeVisible();
});
