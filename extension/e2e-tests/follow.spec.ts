import { test, expect, PAGE_TO_PAGE_URL } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

// A tab read once is read again when it navigates, without another click.
// Test builds hold <all_urls>, which stands in for the user's "Follow me on this site" grant.
test("a followed tab is rescanned after full and in-page navigation", async ({ context, extensionId }) => {
  const site = await context.newPage();
  await site.goto(`${FIXTURE_ORIGIN}/docs.html`);
  const [worker] = context.serviceWorkers();
  const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, site.url());

  const panelUrl = `chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.SIDEPANEL}?tabId=${tabId}`;
  const [panel] = await Promise.all([
    context.waitForEvent("page", (page) => page.url().startsWith(panelUrl)),
    worker.evaluate((url) => chrome.windows.create({ url }), panelUrl),
  ]);
  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("page-title")).toHaveText(/Lattice Docs/);

  // Full page load to another page on the site.
  await site.goto(`${FIXTURE_ORIGIN}/catalog.html`);
  await expect(panel.getByTestId("page-title")).toHaveText(/Northfield Outfitters/, { timeout: 10_000 });
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  // Same-document navigation, the way GitHub and other single-page apps move between views.
  await site.evaluate(() => history.pushState({}, "", "/catalog.html?view=sale"));
  await expect(panel.getByText(`${FIXTURE_ORIGIN}/catalog.html?view=sale`)).toBeVisible({ timeout: 10_000 });
});
