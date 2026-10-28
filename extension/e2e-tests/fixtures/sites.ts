import type { BrowserContext, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { TabSession } from "../../src/shared/types";
import { openWithPanel } from ".";

// The evaluation set (../evaluation): real pages, visited the same way by the collector and the runner.
export const EVALUATION = path.resolve("../evaluation");

export type Site = { id: string; name: string; kind: string; url: string };

export const SITES = JSON.parse(readFileSync(path.join(EVALUATION, "sites.json"), "utf8")) as Array<Site>;

// Cookie and consent walls: answer the way a privacy-minded user would, rejecting first.
const REJECT = /^(reject all|reject|decline|decline optional cookies|only necessary|necessary only|use necessary cookies only|refuse all|i do not agree)$/i;
const ACCEPT = /^(accept all|accept|i agree|agree|allow all|accept all cookies|accept cookies|ok)$/i;

// Opens the site at 1280×800 with the panel pinned to it, and answers a cookie wall if one shows.
export async function openSite(context: BrowserContext, extensionId: string, site: Site) {
  const started = Date.now();
  const opened = await openWithPanel(context, extensionId, site.url);
  const page = opened.site;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  let consent: string | undefined;
  for (const pattern of [REJECT, ACCEPT]) {
    // Match the visible label: some walls give buttons a long accessible name (YouTube's
    // "Reject all" is named "Reject the use of cookies and other data...").
    const button = page.locator("button, [role=button]").filter({ hasText: pattern }).first();
    if (await button.isVisible().catch(() => false)) {
      consent = `${(await button.innerText()).trim()} (${pattern === REJECT ? "reject" : "accept"})`;
      await button.click().catch(() => {});
      await page.waitForTimeout(2000);
      break;
    }
  }
  // A short video would end and autoplay the next one, navigating mid-run.
  await page.evaluate(() => {
    for (const media of document.querySelectorAll("video, audio")) (media as HTMLMediaElement).pause();
  });
  return { ...opened, consent, loadMs: Date.now() - started };
}

export async function readSession(panel: Page, tabId: number): Promise<TabSession | undefined> {
  return (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as
    | TabSession
    | undefined;
}
