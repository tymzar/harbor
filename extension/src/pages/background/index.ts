import type { PageScan, PanelRequest, TabSession } from "../../shared/types";
import { sessionKey } from "../../shared/types";
import { propose } from "./propose";

// Pages Chrome never lets extensions script, even with activeTab.
const RESTRICTED =
  /^(chrome|chrome-extension|edge|about|devtools|view-source):|^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/;

// Opening the side panel narrows the page; wait for the reflow before measuring.
const SETTLE_MS = 350;

async function saveSession(session: TabSession) {
  await chrome.storage.session.set({ [sessionKey(session.tabId)]: session });
}

async function scanTab(tabId: number, settle: boolean) {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url ?? "";

  if (!url || RESTRICTED.test(url)) {
    await saveSession({ tabId, status: "restricted", url, updatedAt: Date.now() });
    return;
  }

  await saveSession({ tabId, status: "scanning", url, updatedAt: Date.now() });

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

    await saveSession({ tabId, status: "ready", url, scan, screenshot, updatedAt: Date.now() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await saveSession({
      tabId,
      status: "error",
      url,
      // activeTab lapses on navigation; that is the common cause here.
      error: /cannot access|permission|activetab/i.test(message)
        ? "Smart Web doesn't have access to this page. Click the toolbar icon on this tab to grant it."
        : message,
      updatedAt: Date.now(),
    });
  }
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
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(sessionKey(tabId));
});

// A new document invalidates node IDs and the activeTab grant.
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading" && change.url)
    void chrome.storage.session.remove(sessionKey(tabId));
});
