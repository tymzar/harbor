import { test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

export const PAGE_TO_PAGE_URL = {
  SIDEPANEL: "sidepanel/sidepanel.html",
  OPTIONS: "options/options.html",
};

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const pathToExtension = path.resolve("build");

    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker)
      serviceWorker = await context.waitForEvent("serviceworker");

    const extensionId = serviceWorker.url().split("/")[2];
    await use(extensionId);
  },
});
export const expect = test.expect;

// Opens a fixture page in its own tab and the side panel in another window, pinned to that tab
// (?tabId=), so the fixture stays the visible tab that captureVisibleTab photographs.
export async function openWithPanel(
  context: BrowserContext,
  extensionId: string,
  url: string
): Promise<{ site: Page; panel: Page; tabId: number }> {
  const site = await context.newPage();
  await site.goto(url);
  const [worker] = context.serviceWorkers();
  const tabId = await worker.evaluate(async (target) => {
    const [tab] = await chrome.tabs.query({ url: target });
    return tab.id!;
  }, site.url());

  const panelUrl = `chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.SIDEPANEL}?tabId=${tabId}`;
  const [panel] = await Promise.all([
    context.waitForEvent("page", (page) => page.url().startsWith(panelUrl)),
    worker.evaluate((target) => chrome.windows.create({ url: target }), panelUrl),
  ]);
  await panel.waitForLoadState();
  return { site, panel, tabId };
}
