import type { PageScan, PanelRequest, SessionStatus, TabSession } from "../../shared/types";
import { sessionKey } from "../../shared/types";
import { propose } from "./propose";
import { forgetPlan, reusePlan } from "./saved-plans";

// Pages Chrome never lets extensions script, even with activeTab.
const RESTRICTED =
  /^(chrome|chrome-extension|edge|about|devtools|view-source):|^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/;

// Chrome's injection errors: pages no extension may script, versus pages we lack access to.
const RESTRICTED_ERROR = /cannot access a chrome|chrome-extension:|extensions gallery|cannot be scripted/i;
const ACCESS_ERROR = /cannot access|permission|activetab|must request/i;

// Opening the side panel narrows the page; wait for the reflow before measuring.
const SETTLE_MS = 350;

async function saveSession(session: TabSession) {
  await chrome.storage.session.set({ [sessionKey(session.tabId)]: session });
}

// Tabs the user has read with Smart Web; they are rescanned when they navigate.
const FOLLOWED_KEY = "followedTabs";
// Navigation settles (SPA content swap, late layout) before an automatic rescan.
const NAVIGATION_SETTLE_MS = 600;
const pendingRescans = new Map<number, ReturnType<typeof setTimeout>>();

async function followedTabs(): Promise<Record<number, string>> {
  const stored = await chrome.storage.session.get(FOLLOWED_KEY);
  return (stored[FOLLOWED_KEY] as Record<number, string> | undefined) ?? {};
}

async function follow(tabId: number, origin: string) {
  const followed = await followedTabs();
  await chrome.storage.session.set({ [FOLLOWED_KEY]: { ...followed, [tabId]: origin } });
}

async function unfollow(tabId: number) {
  const followed = await followedTabs();
  delete followed[tabId];
  await chrome.storage.session.set({ [FOLLOWED_KEY]: followed });
}

const originOf = (url: string) => (URL.canParse(url) ? new URL(url).origin : undefined);

async function scanTab(tabId: number, settle: boolean) {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url ?? "";
  const followed = await followedTabs();
  const lastOrigin = originOf(url) ?? followed[tabId];

  // Without access Chrome hides the URL; the injection error below then tells the cases apart.
  if (RESTRICTED.test(url)) {
    await saveSession({ tabId, status: "restricted", url, updatedAt: Date.now() });
    return;
  }

  await saveSession({ tabId, status: "scanning", url, lastOrigin, updatedAt: Date.now() });
  if (lastOrigin) await follow(tabId, lastOrigin);

  try {
    if (settle) await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/index.js"],
    });
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => globalThis.smartWeb!.scan(),
    });
    const scan = injection?.result as PageScan | undefined;
    if (!scan) throw new Error("The page returned no scan result.");

    // Captured right after the scan so boxes and pixels describe the same layout.
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "jpeg",
      quality: 70,
    });

    // A plan saved for this page (or its template) comes back without a Meta call.
    const proposal = await reusePlan(scan);
    await saveSession({ tabId, status: "ready", url, lastOrigin, scan, screenshot, proposal, updatedAt: Date.now() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // activeTab lapses on a full page load; that is the common cause of an access error.
    let status: SessionStatus = "error";
    if (RESTRICTED_ERROR.test(message)) status = "restricted";
    else if (ACCESS_ERROR.test(message)) status = "needs-access";
    await saveSession({ tabId, status, url, lastOrigin, error: message, updatedAt: Date.now() });
  }
}

// Rescans a followed tab once its navigation has settled. With site access granted this
// covers full page loads; with only activeTab it covers same-document (SPA) navigation.
function scheduleRescan(tabId: number) {
  clearTimeout(pendingRescans.get(tabId));
  pendingRescans.set(
    tabId,
    setTimeout(async () => {
      pendingRescans.delete(tabId);
      // The tab may have closed while waiting.
      const tab = await chrome.tabs.get(tabId).catch(() => {});
      if (!tab) return;
      if (tab.status !== "complete") return scheduleRescan(tabId);
      await scanTab(tabId, false);
    }, NAVIGATION_SETTLE_MS)
  );
}

async function forget(tabId: number) {
  const key = sessionKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const session = stored[key] as TabSession | undefined;
  if (!session?.url) return;
  await forgetPlan(session.url);
  await saveSession({ ...session, proposal: undefined, updatedAt: Date.now() });
}

chrome.runtime.onInstalled.addListener(() => {
  // Handled in onClicked instead, so one click both opens the panel and grants activeTab.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch((error) => console.error("[background] setPanelBehavior", error));
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  // sidePanel.open must be called synchronously inside the user gesture.
  void chrome.sidePanel.open({ tabId: tab.id });
  void scanTab(tab.id, true);
});

chrome.runtime.onMessage.addListener((message: PanelRequest) => {
  if (message.type === "rescan") void scanTab(message.tabId, false);
  if (message.type === "propose") void propose(message.tabId, message.includeScreenshot);
  if (message.type === "forget") void forget(message.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTimeout(pendingRescans.get(tabId));
  void chrome.storage.session.remove(sessionKey(tabId));
  void unfollow(tabId);
});

// A new URL invalidates node IDs (and, for a full page load, the activeTab grant).
// Followed tabs are read again automatically; saved plans make that free of model calls.
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (!change.url && change.status !== "complete") return;
  void followedTabs().then((followed) => {
    if (!(tabId in followed)) {
      if (change.url) void chrome.storage.session.remove(sessionKey(tabId));
      return;
    }
    scheduleRescan(tabId);
  });
});
