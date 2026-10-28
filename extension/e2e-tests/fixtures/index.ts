import { test as base, chromium, type BrowserContext } from "@playwright/test";
import path from "path";

export const PAGE_TO_PAGE_URL = {
  POPUP: "popup/popup.html",
  PANEL: "panel/panel.html",
  OPTIONS: "options/options.html",
  NEWTAB: "newtab/newtab.html",
  DEVTOOLS: "devtools/devtools.html",
};

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const __dirname = path.resolve();
    const pathToExtension = path.join(__dirname, "build");

    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
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
