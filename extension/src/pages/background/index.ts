import type { Answers } from "../../shared/questions";
import type { PageScan, PanelRequest, SessionStatus, TabSession } from "../../shared/types";
import { sessionKey, shotKey } from "../../shared/types";
import { STALE_SCAN, checkOrderable, clearLayout, effectiveGroups, pickGroups, showLayout } from "./layout";
import { propose } from "./propose";
import { noteAutoSuggested, shouldAutoSuggest } from "./auto-suggest";
import { forgetPlan, keptLabels, rememberAnswers, rememberKept, reusePlan } from "./saved-plans";
import { decide, orderOffer, recordActivation, setLearning } from "./learning";
import { hideNode } from "./user-groups";

// Pages Chrome never lets extensions script, even with activeTab.
const RESTRICTED =
  /^(chrome|chrome-extension|edge|about|devtools|view-source):|^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/;

// Chrome's injection errors: pages no extension may script, versus pages we lack access to.
const RESTRICTED_ERROR = /cannot access a chrome|chrome-extension:|extensions gallery|cannot be scripted/i;
const ACCESS_ERROR = /cannot access|permission|activetab|must request/i;

// Opening the side panel narrows the page; wait for the reflow before measuring.
const SETTLE_MS = 350;

// Chrome allows two captureVisibleTab calls per second; quick rescans (navigation plus a
// click) would otherwise fail. Captures are spaced out instead.
const CAPTURE_GAP_MS = 600;
let nextCaptureAt = 0;

async function captureTab(windowId: number): Promise<string> {
  const wait = nextCaptureAt - Date.now();
  nextCaptureAt = Math.max(Date.now(), nextCaptureAt) + CAPTURE_GAP_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  return chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 70 });
}

async function saveSession(session: TabSession) {
  await chrome.storage.session.set({ [sessionKey(session.tabId)]: session });
}

async function readSession(tabId: number): Promise<TabSession | undefined> {
  const key = sessionKey(tabId);
  const stored = await chrome.storage.session.get(key);
  return stored[key] as TabSession | undefined;
}

// Tabs the user has read with Harbor; they are rescanned when they navigate.
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
  // A layout on the page carries over to the next scan of this tab (navigation, rescan, reopening
  // the panel), kept or still in preview.
  const previous = await readSession(tabId);
  const carried = previous?.layout && previous.layout.labels.length > 0 ? previous.layout : undefined;

  // Without access Chrome hides the URL; the injection error below then tells the cases apart.
  if (RESTRICTED.test(url)) {
    await saveSession({ tabId, status: "restricted", url, updatedAt: Date.now() });
    return;
  }

  await saveSession({ tabId, status: "scanning", url, lastOrigin, updatedAt: Date.now() });
  if (lastOrigin) await follow(tabId, lastOrigin);

  try {
    if (settle) await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    // Injecting restores any marks left by the previous copy, so the scan measures the site's own layout.
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
    const screenshot = await captureTab(tab.windowId);

    // A plan saved for this page (or its template) comes back without a Meta call.
    const proposal = await reusePlan(scan);
    if (proposal) proposal.orderable = await checkOrderable(tabId, proposal.accepted ?? []);
    await chrome.storage.session.set({ [shotKey(tabId)]: screenshot });
    const session: TabSession = { tabId, status: "ready", url, lastOrigin, scan, hasScreenshot: true, proposal, updatedAt: Date.now() };
    // Otherwise what the user kept for this kind of page comes back by itself, with no Meta call.
    const keptHere = proposal?.plan ? await keptLabels(scan.url, effectiveGroups(session)) : [];
    const kept = carried ?? (keptHere.length > 0 ? { state: "applied" as const, labels: keptHere } : undefined);
    if (kept && proposal) session.layout = await showLayout(session, pickGroups(session, kept.labels), kept.state, false);
    if (proposal) session.suggestion = await orderOffer(session);
    await saveSession(session);

    // A new kind of page on a site the user follows and kept a layout on gets a suggestion without
    // a click, once a day per kind of page. Not while a request is already under way for this tab.
    if (previous?.proposal?.status === "running") return;
    const shape = await shouldAutoSuggest(scan.url);
    if (shape) {
      await noteAutoSuggested(shape);
      await propose(tabId, false, "", true);
    }
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
      // A rescan renumbers elements; never pull them out from under a pick in progress.
      const current = await readSession(tabId);
      if (current?.picking) return scheduleRescan(tabId);
      await scanTab(tabId, false);
    }, NAVIGATION_SETTLE_MS)
  );
}

// A site that redraws an applied region gets it re-applied from the saved plan, a few times at
// most: a page that redraws because of the change itself would otherwise loop.
const REDRAW_LIMIT = 5;
const REDRAW_WINDOW_MS = 30_000;
const REDRAW_NOTICE = "This page keeps redrawing, so Harbor stopped re-applying your layout. Rescan to try again.";
const redraws = new Map<number, Array<number>>();

async function redrawn(tabId: number) {
  const session = await readSession(tabId);
  // Only a kept layout is restored; a preview or a plan in progress is left to the user.
  if (session?.layout?.state !== "applied" || session.picking || session.proposal?.status === "running") return;
  const now = Date.now();
  const recent = (redraws.get(tabId) ?? []).filter((at) => now - at < REDRAW_WINDOW_MS);
  if (recent.length >= REDRAW_LIMIT) {
    await saveSession({ ...session, notice: REDRAW_NOTICE, updatedAt: now });
    return;
  }
  redraws.set(tabId, [...recent, now]);
  scheduleRescan(tabId);
}

async function activated(tabId: number, label: string, nodeId: string, features: Array<number>) {
  const session = await readSession(tabId);
  if (!session) return;
  const next = await recordActivation(session, label, nodeId, features);
  if (next) await saveSession(next);
}

async function learning(tabId: number, action: "enable" | "disable" | "reset" | "accept" | "dismiss") {
  const session = await readSession(tabId);
  if (!session) return;
  try {
    if (action === "accept" || action === "dismiss") {
      await saveSession(await decide(session, action === "accept"));
      return;
    }
    await setLearning(session, action);
    if (action !== "enable") await saveSession({ ...session, suggestion: undefined, updatedAt: Date.now() });
  } catch (error) {
    await fail(session, error);
  }
}

async function forget(tabId: number) {
  const key = sessionKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const session = stored[key] as TabSession | undefined;
  if (!session?.url) return;
  await forgetPlan(session.url);
  if (session.layout) await clearLayout(tabId);
  await saveSession({ ...session, proposal: undefined, layout: undefined, updatedAt: Date.now() });
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

// A stale scan is a notice in the panel (rescan and retry); lost access and real failures are states.
async function fail(session: TabSession, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const base: TabSession = { ...session, picking: undefined, updatedAt: Date.now() };
  await saveSession(
    message === STALE_SCAN
      ? { ...base, notice: message }
      : { ...base, status: ACCESS_ERROR.test(message) ? "needs-access" : "error", error: message }
  );
}

async function changeLayout(tabId: number, action: "preview" | "apply" | "restore", labels?: Array<string>) {
  const session = await readSession(tabId);
  if (!session) return;
  try {
    let layout: TabSession["layout"];
    if (action === "restore") {
      await clearLayout(tabId);
      // Restore on a kept layout turns it off for the pages it covers; cancelling a preview doesn't.
      if (session.layout?.state === "applied" && session.url) await rememberKept(session.url, effectiveGroups(session));
    }
    else layout = await showLayout(session, pickGroups(session, labels), action === "preview" ? "preview" : "applied");
    await saveSession({ ...session, layout, notice: undefined, updatedAt: Date.now() });
  } catch (error) {
    await fail(session, error);
  }
}

// Answers change operations locally; whatever is on the page follows at once.
async function answer(tabId: number, answers: Answers) {
  const session = await readSession(tabId);
  if (!session?.proposal) return;
  // Stored first, so a rescan right after answering already finds them. They belong to the plan
  // they answer, which may have been saved on another page of the same kind.
  const savedOn = session.proposal.reused?.fromUrl ?? session.url;
  if (savedOn) await rememberAnswers(savedOn, answers);
  const next: TabSession = { ...session, proposal: { ...session.proposal, answers }, updatedAt: Date.now() };
  try {
    if (session.layout) next.layout = await showLayout(next, effectiveGroups(next), session.layout.state);
    await saveSession(next);
  } catch (error) {
    await fail(next, error);
  }
}

type PickResult = { nodeId: string; description: string; scannedAt: number } | undefined;

async function runInPage<T>(tabId: number, inPage: () => T | Promise<T>): Promise<T | undefined> {
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: inPage });
  return injection?.result as T | undefined;
}

// "Hide something else": point and click on the page, adjust in the panel, then hide.
async function pick(tabId: number, action: "start" | "wider" | "narrower" | "hide" | "cancel") {
  const session = await readSession(tabId);
  if (!session?.scan) return;
  try {
    if (action === "start") {
      await saveSession({ ...session, picking: { phase: "pointing" }, notice: undefined, updatedAt: Date.now() });
      const chosen = await runInPage<PickResult>(tabId, () => globalThis.smartWeb!.pick());
      const latest = await readSession(tabId);
      if (!latest) return;
      await saveSession({
        ...latest,
        picking: chosen ? { phase: "selected", ...chosen } : undefined,
        updatedAt: Date.now(),
      });
      return;
    }
    if (action === "wider" || action === "narrower") {
      const chosen =
        action === "wider"
          ? await runInPage<PickResult>(tabId, () => globalThis.smartWeb!.adjustPick("wider"))
          : await runInPage<PickResult>(tabId, () => globalThis.smartWeb!.adjustPick("narrower"));
      // No answer means the page was rescanned and the selection went with it.
      await (chosen
        ? saveSession({ ...session, picking: { phase: "selected", ...chosen }, updatedAt: Date.now() })
        : fail(session, new Error(STALE_SCAN)));
      return;
    }
    await runInPage(tabId, () => globalThis.smartWeb!.endPick());
    const picked = session.picking?.phase === "selected" ? session.picking : undefined;
    if (action === "hide" && picked && picked.scannedAt !== session.scan.scannedAt) {
      await saveSession({ ...session, picking: undefined, notice: STALE_SCAN, updatedAt: Date.now() });
      return;
    }
    const next = action === "hide" && picked ? await hideNode(session, picked.nodeId) : session;
    await saveSession({ ...next, picking: undefined, notice: undefined, updatedAt: Date.now() });
  } catch (error) {
    await fail(session, error);
  }
}

async function hideFromList(tabId: number, nodeId: string) {
  const session = await readSession(tabId);
  if (!session?.scan) return;
  try {
    await saveSession({ ...(await hideNode(session, nodeId)), notice: undefined });
  } catch (error) {
    await fail(session, error);
  }
}

chrome.runtime.onMessage.addListener((message: PanelRequest, sender) => {
  if (message.type === "rescan") void scanTab(message.tabId, false);
  if (message.type === "propose") void propose(message.tabId, message.includeScreenshot, message.goal);
  if (message.type === "forget") void forget(message.tabId);
  if (message.type === "answer") void answer(message.tabId, message.answers);
  if (message.type === "pick") void pick(message.tabId, message.action);
  if (message.type === "hide-node") void hideFromList(message.tabId, message.nodeId);
  if (message.type === "layout") void changeLayout(message.tabId, message.action, message.labels);
  // Escape on the page already undid the preview; the stylesheet and session follow.
  if (message.type === "page-restored" && sender.tab?.id !== undefined) void changeLayout(sender.tab.id, "restore");
  if (message.type === "page-redrawn" && sender.tab?.id !== undefined) void redrawn(sender.tab.id);
  if (message.type === "activation" && sender.tab?.id !== undefined) void activated(sender.tab.id, message.label, message.nodeId, message.features);
  if (message.type === "learning") void learning(message.tabId, message.action);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTimeout(pendingRescans.get(tabId));
  redraws.delete(tabId);
  void chrome.storage.session.remove([sessionKey(tabId), shotKey(tabId)]);
  void unfollow(tabId);
});

// A new URL invalidates node IDs (and, for a full page load, the activeTab grant).
// Followed tabs are read again automatically; saved plans make that free of model calls.
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (!change.url && change.status !== "complete") return;
  void followedTabs().then((followed) => {
    if (!(tabId in followed)) {
      if (change.url) void chrome.storage.session.remove([sessionKey(tabId), shotKey(tabId)]);
      return;
    }
    scheduleRescan(tabId);
  });
});
