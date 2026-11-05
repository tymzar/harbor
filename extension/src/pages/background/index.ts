import type { Answers } from "../../shared/questions";
import type { PageScan, PanelRequest, SessionStatus, TabSession } from "../../shared/types";
import { DRAFT_ABANDONED_MS, sessionKey, shotKey } from "../../shared/types";
import type { PageTarget } from "./layout";
import { STALE_SCAN, checkOrderable, clearLayout, effectiveGroups, pageTarget, pickGroups, showLayout } from "./layout";
import { propose } from "./propose";
import { noteAutoSuggested, shouldAutoSuggest } from "./auto-suggest";
import { forgetPlan, hasPlansOn, keptLabels, rememberAnswers, rememberKept, reusePlan } from "./saved-plans";
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

// Some sites draw the page inside one frame of their own: LinkedIn's messaging pages, reached
// from the feed, run the older app in an iframe that fills the window, under a shell whose own
// document is empty. Harbor reads and changes the frame that fills the window and is in front,
// the top frame otherwise. In front matters: the feed keeps the same iframe full-size behind
// the page (opacity 0, z-index -1) ready for that jump. Only a frame of the site's own origin
// counts: another site's frame is its own page.
const FRAME_FILL = 0.8;

async function contentFrame(tabId: number): Promise<number | undefined> {
  const probes = await chrome.scripting
    .executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const top = globalThis.self === globalThis.top;
        // Null at the top and in a frame of another origin, which is never chosen anyway.
        const frame = globalThis.frameElement;
        let shown = top;
        if (frame) {
          const rect = frame.getBoundingClientRect();
          const at = (fx: number, fy: number) => frame.ownerDocument.elementFromPoint(rect.left + rect.width * fx, rect.top + rect.height * fy);
          shown =
            frame.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
            [at(0.5, 0.5), at(0.25, 0.25), at(0.75, 0.75)].includes(frame);
        }
        return { top, shown, origin: location.origin, area: innerWidth * innerHeight };
      },
    })
    .catch(() => []);
  const top = probes.find((probe) => probe.result?.top)?.result;
  if (!top || top.area === 0) return undefined;
  const filling = probes
    .filter(({ result }) => result && !result.top && result.shown && result.origin === top.origin && result.area >= FRAME_FILL * top.area)
    .toSorted((a, b) => b.result!.area - a.result!.area);
  return filling[0]?.frameId;
}

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

// The newest read of a tab wins: one overtaken by a later one (the toolbar clicked while a
// followed site's automatic read is under way) saves nothing, so the panel never shows a scan
// whose element numbers a later scan is about to replace.
const scanSeq = new Map<number, number>();
// A toolbar click right after an automatic read of the same page keeps that read; reading again
// would only renumber the elements the panel is showing.
const FRESH_MS = 1500;

async function scanTab(tabId: number, settle: boolean) {
  // Whatever automatic read was waiting for this tab, this one replaces it.
  clearTimeout(pendingRescans.get(tabId));
  pendingRescans.delete(tabId);
  const seq = (scanSeq.get(tabId) ?? 0) + 1;
  scanSeq.set(tabId, seq);
  const current = () => scanSeq.get(tabId) === seq;
  const save = async (session: TabSession) => {
    if (current()) await saveSession(session);
  };

  const tab = await chrome.tabs.get(tabId);
  const url = tab.url ?? "";
  const followed = await followedTabs();
  const lastOrigin = originOf(url) ?? followed[tabId];
  // A layout on the page carries over to the next scan of this tab (navigation, rescan, reopening
  // the panel), kept or still in preview.
  const previous = await readSession(tabId);
  const carried = previous?.layout && previous.layout.labels.length > 0 ? previous.layout : undefined;
  if (settle && previous?.status === "ready" && previous.url === url && previous.scan && Date.now() - previous.scan.scannedAt < FRESH_MS) return;

  // Without access Chrome hides the URL; the injection error below then tells the cases apart.
  if (RESTRICTED.test(url)) {
    await save({ tabId, status: "restricted", url, updatedAt: Date.now() });
    return;
  }

  await save({ tabId, status: "scanning", url, lastOrigin, updatedAt: Date.now() });
  if (lastOrigin) await follow(tabId, lastOrigin);

  try {
    if (settle) await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    const frameId = await contentFrame(tabId);
    const target = pageTarget({ tabId, frameId });
    // Injecting restores any marks left by the previous copy, so the scan measures the site's own layout.
    await chrome.scripting.executeScript({ target, files: ["content/index.js"] });
    const [injection] = await chrome.scripting.executeScript({ target, func: () => globalThis.smartWeb!.scan() });
    const scan = injection?.result as PageScan | undefined;
    if (!scan) throw new Error("The page returned no scan result.");

    // Captured right after the scan so boxes and pixels describe the same layout. Chrome captures
    // the window's visible tab: a tab read in the background (a followed site loading) gets none.
    // Chrome also only allows the capture with activeTab (the toolbar click) or <all_urls>; a
    // site grant ("Follow me on …", or all http/https sites) is refused. The read goes on without
    // a screenshot then, which only the optional SAM pass needs: a refused capture must not turn
    // a page Harbor has just read into "needs access".
    const screenshot = tab.active ? await captureTab(tab.windowId).catch(() => "") : "";

    // A plan saved for this page (or its template) comes back without a Meta call.
    const proposal = await reusePlan(scan);
    if (proposal) proposal.orderable = await checkOrderable({ tabId, frameId }, proposal.accepted ?? []);
    await (screenshot ? chrome.storage.session.set({ [shotKey(tabId)]: screenshot }) : chrome.storage.session.remove(shotKey(tabId)));
    const session: TabSession = { tabId, status: "ready", url, frameId, lastOrigin, scan, hasScreenshot: Boolean(screenshot), proposal, updatedAt: Date.now() };
    // Otherwise what the user kept for this kind of page comes back by itself, with no Meta call.
    const keptHere = proposal?.plan ? await keptLabels(scan.url, effectiveGroups(session)) : [];
    const kept = carried ?? (keptHere.length > 0 ? { state: "applied" as const, labels: keptHere } : undefined);
    if (!current()) return;
    if (kept && proposal) session.layout = await showLayout(session, pickGroups(session, kept.labels), kept.state, false);
    if (proposal) session.suggestion = await orderOffer(session);
    await save(session);

    // A new kind of page on a site the user follows and kept a layout on gets a suggestion without
    // a click, once a day per kind of page. Not while a request is already under way for this tab.
    if (!current() || previous?.proposal?.status === "running") return;
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
    // In the worker's console (chrome://extensions → Harbor → "service worker"): the panel shows
    // the message only for a plain error, and an access problem's wording tells which call failed.
    console.warn("[harbor] read failed", { tabId, url, status, message });
    await save({ tabId, status, url, lastOrigin, error: message, updatedAt: Date.now() });
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
  if (session.layout) await clearLayout(session);
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
      await clearLayout(session);
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

async function runInPage<T>(target: PageTarget, inPage: () => T | Promise<T>): Promise<T | undefined> {
  const [injection] = await chrome.scripting.executeScript({ target: pageTarget(target), func: inPage });
  return injection?.result as T | undefined;
}

// "Hide something else": point and click on the page, adjust in the panel, then hide.
async function pick(tabId: number, action: "start" | "wider" | "narrower" | "hide" | "cancel") {
  const session = await readSession(tabId);
  if (!session?.scan) return;
  try {
    if (action === "start") {
      await saveSession({ ...session, picking: { phase: "pointing" }, notice: undefined, updatedAt: Date.now() });
      const chosen = await runInPage<PickResult>(session, () => globalThis.smartWeb!.pick());
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
          ? await runInPage<PickResult>(session, () => globalThis.smartWeb!.adjustPick("wider"))
          : await runInPage<PickResult>(session, () => globalThis.smartWeb!.adjustPick("narrower"));
      // No answer means the page was rescanned and the selection went with it.
      await (chosen
        ? saveSession({ ...session, picking: { phase: "selected", ...chosen }, updatedAt: Date.now() })
        : fail(session, new Error(STALE_SCAN)));
      return;
    }
    await runInPage(session, () => globalThis.smartWeb!.endPick());
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

// A draft the user gave up on, or one the worker lost: the proposal ends in its error state, so
// the panel offers "Suggest a layout" again. A draft still in flight that finishes later overwrites it.
const INTERRUPTED = "Harbor was interrupted while drafting. Ask again.";

async function abandonDraft(tabId: number, reason: string) {
  const session = await readSession(tabId);
  if (session?.proposal?.status !== "running") return;
  await saveSession({ ...session, proposal: { ...session.proposal, status: "error", step: undefined, error: reason, finishedAt: Date.now() }, updatedAt: Date.now() });
}

// Chrome stops the worker between events; a draft that was running when it did is stuck "running"
// in session storage with nothing to finish it. Swept on every start.
async function sweepAbandonedDrafts() {
  const all = await chrome.storage.session.get();
  const now = Date.now();
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith("session:")) continue;
    const session = value as TabSession;
    if (session.proposal?.status === "running" && now - session.proposal.startedAt > DRAFT_ABANDONED_MS) await abandonDraft(session.tabId, INTERRUPTED);
  }
}
// eslint-disable-next-line unicorn/prefer-top-level-await -- a classic worker script, no top-level await
void sweepAbandonedDrafts();

chrome.runtime.onMessage.addListener((message: PanelRequest, sender) => {
  if (message.type === "rescan") void scanTab(message.tabId, false);
  if (message.type === "cancel-propose") void abandonDraft(message.tabId, "Stopped by you.");
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

// A site the user let Harbor follow ("Follow me on …" in the panel): persistent access, granted
// through Chrome's own prompt.
async function siteFollowed(origin: string): Promise<boolean> {
  if (!/^https?:/.test(origin)) return false;
  return chrome.permissions.contains({ origins: [`${origin}/*`] }).catch(() => false);
}

// Access just granted: the tabs that were waiting for it are read now.
chrome.permissions.onAdded.addListener(() => {
  void chrome.storage.session.get().then((stored) => {
    for (const value of Object.values(stored) as Array<TabSession | undefined>) {
      if (value?.status === "needs-access") scheduleRescan(value.tabId);
    }
  });
});

// A new URL invalidates node IDs (and, for a full page load, the activeTab grant).
// Followed tabs are read again automatically; saved plans make that free of model calls.
// So is any tab that loads a followed site where something was saved, panel open or not: what
// the user kept there comes back by itself in a new tab or after Chrome restarts, with no click
// on the toolbar. A site with nothing saved waits for the click: there is nothing to bring back,
// and a page the user never asked about is not read on its own.
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (!change.url && change.status !== "complete") return;
  void followedTabs().then(async (followed) => {
    if (tabId in followed) return scheduleRescan(tabId);
    const url = change.url ?? tab.url ?? "";
    const origin = originOf(url);
    if (origin && (await siteFollowed(origin)) && (await hasPlansOn(url))) return scheduleRescan(tabId);
    if (change.url) void chrome.storage.session.remove([sessionKey(tabId), shotKey(tabId)]);
  });
});
