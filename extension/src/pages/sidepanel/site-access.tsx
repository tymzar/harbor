import { useEffect, useState } from "react";
import { Alert, Button, Switch } from "@heroui/react";

import type { PanelRequest, TabSession } from "../../shared/types";
import { sessionKey } from "../../shared/types";

// Persistent access to one site, granted only through Chrome's own prompt. Without it,
// Harbor keeps a page only until the tab loads a new document (activeTab).
const pattern = (origin: string) => `${origin}/*`;
const hostOf = (origin: string) => origin.replace(/^https?:\/\//, "");
// Every site, through the same Chrome prompt; the manifest lists these as optional.
const ALL_SITES = ["https://*/*", "http://*/*"];

// Whether a tab can be read now. Chrome only shows an extension the URL of a tab it has access to.
// Undefined until known.
export function useTabReadable(tabId: number | undefined) {
  const [readable, setReadable] = useState<boolean>();

  useEffect(() => {
    setReadable(undefined);
    if (tabId === undefined) return;
    const check = () => void chrome.tabs.get(tabId).then((tab) => setReadable(Boolean(tab.url))).catch(() => setReadable(false));
    const onUpdated = (updated: number) => {
      if (updated === tabId) check();
    };
    check();
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.permissions.onAdded.addListener(check);
    chrome.permissions.onRemoved.addListener(check);
    return () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.permissions.onAdded.removeListener(check);
      chrome.permissions.onRemoved.removeListener(check);
    };
  }, [tabId]);

  return readable;
}

export function useAllSites() {
  const [allSites, setAllSites] = useState(false);

  useEffect(() => {
    const check = () => void chrome.permissions.contains({ origins: ALL_SITES }).then(setAllSites);
    check();
    chrome.permissions.onAdded.addListener(check);
    chrome.permissions.onRemoved.addListener(check);
    return () => {
      chrome.permissions.onAdded.removeListener(check);
      chrome.permissions.onRemoved.removeListener(check);
    };
  }, []);

  return allSites;
}

function useSiteAccess(origin: string | undefined) {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!origin) return;
    const check = () => void chrome.permissions.contains({ origins: [pattern(origin)] }).then(setGranted);
    check();
    chrome.permissions.onAdded.addListener(check);
    chrome.permissions.onRemoved.addListener(check);
    return () => {
      chrome.permissions.onAdded.removeListener(check);
      chrome.permissions.onRemoved.removeListener(check);
    };
  }, [origin]);

  // Must run inside the click: Chrome only shows the prompt for a user gesture.
  const request = () => chrome.permissions.request({ origins: [pattern(origin!)] });
  const revoke = () => chrome.permissions.remove({ origins: [pattern(origin!)] });

  return { granted, request, revoke };
}

// Tabs this panel already asked to read by itself (see NeedsAccess).
const autoRead = new Set<number>();

function rescan(tabId: number) {
  const message: PanelRequest = { type: "rescan", tabId };
  void chrome.runtime.sendMessage(message);
}

export function SiteAccessSwitch({ origin }: { origin: string }) {
  const { granted, request, revoke } = useSiteAccess(origin);
  const allSites = useAllSites();
  if (!/^https?:/.test(origin)) return;

  // Chrome can't take one site out of an all-sites grant, so the switch turns off all of it.
  if (allSites) {
    return (
      <Switch isSelected onChange={() => void chrome.permissions.remove({ origins: ALL_SITES })} data-testid="site-access">
        <Switch.Content className="text-sm">
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <span>
            Follow me on all sites
            <span className="block text-xs text-muted">Sites with a saved layout are read as they load.</span>
          </span>
        </Switch.Content>
      </Switch>
    );
  }

  return (
    <Switch
      isSelected={granted}
      onChange={(next) => void (next ? request() : revoke())}
      data-testid="site-access"
    >
      <Switch.Content className="text-sm">
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <span>
          Follow me on {hostOf(origin)}
          <span className="block text-xs text-muted">
            {granted
              ? "Pages on this site are read again when you navigate."
              : "Without this, a full page load needs a toolbar click."}
          </span>
        </span>
      </Switch.Content>
    </Switch>
  );
}

// Chrome hides the URL of a tab Harbor has no access to. For a tab opened from a page Harbor has
// read, that page's site is the likely one: a guess, so it is checked by the rescan that follows.
function useOpenerOrigin(tabId: number, known: boolean) {
  const [opener, setOpener] = useState<string>();

  useEffect(() => {
    setOpener(undefined);
    if (known) return;
    void chrome.tabs.get(tabId).then(async ({ openerTabId }) => {
      if (openerTabId === undefined) return;
      const key = sessionKey(openerTabId);
      const stored = await chrome.storage.session.get(key);
      setOpener((stored[key] as TabSession | undefined)?.lastOrigin);
    });
  }, [tabId, known]);

  return opener;
}

export function NeedsAccess({ tabId, origin, error }: { tabId: number; origin: string | undefined; error?: string }) {
  const opener = useOpenerOrigin(tabId, Boolean(origin));
  const site = origin ?? opener;
  const { granted, request } = useSiteAccess(site);
  const allSites = useAllSites();
  // Already allowed and still unreadable: this tab is on another site than the one it came from.
  const offer = site && /^https?:/.test(site) && (origin || !granted) ? site : undefined;

  const allow = async () => {
    if (await request()) rescan(tabId);
  };
  // Must run inside the click, like the site's own request.
  const allowAll = async () => {
    if (await chrome.permissions.request({ origins: ALL_SITES })) rescan(tabId);
  };

  // This notice shows for the session the failed read left behind, which outlives the grant until
  // the next read replaces it. So "allowed everywhere" alone doesn't mean a browser page: right
  // after the prompt, a normal site still carries the old state. Ask Chrome whether the tab is
  // readable now; only an unreadable one is a page no extension can read.
  const readable = useTabReadable(tabId);
  // Allowed and readable, with the old state still showing: the read that follows the grant is
  // under way, or never ran (the prompt was answered elsewhere). Ask for it once by itself; the
  // button stays for a read that fails again, with its reason. Once per tab for the panel's life
  // (not per mount: a failing read re-mounts this notice, and would otherwise retry forever).
  useEffect(() => {
    if (!allSites || readable !== true || autoRead.has(tabId)) return;
    autoRead.add(tabId);
    rescan(tabId);
  }, [allSites, readable, tabId]);
  if (allSites && readable === false) {
    return (
      <Alert status="default" data-testid="needs-access">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Chrome doesn't allow extensions here</Alert.Title>
          <Alert.Description>Browser pages and the Web Store can't be changed. Open a regular website.</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  if (allSites) {
    return (
      <Alert status="default" data-testid="needs-access">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Reading this page</Alert.Title>
          <Alert.Description>
            Harbor can read this tab now.
            {error && <span className="mt-1 block text-xs text-muted">Last attempt: {error}</span>}
          </Alert.Description>
          <Button size="sm" variant="primary" className="mt-2" onPress={() => rescan(tabId)} data-testid="read-now">
            Read this page
          </Button>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <Alert status="warning" data-testid="needs-access">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{origin ? "This page loaded after Harbor last read it" : "Harbor can't read this tab yet"}</Alert.Title>
        <Alert.Description>
          {origin
            ? "Chrome ends Harbor's access when a tab loads a new page. "
            : "Chrome gives Harbor access one tab at a time, and a new tab starts without it. "}
          Allow Harbor on all sites so you never see this again, or click its toolbar icon to read just this page.
        </Alert.Description>
        <span className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onPress={() => void allowAll()} data-testid="allow-all-sites">
            Allow on all sites
          </Button>
          {offer && (
            <Button size="sm" variant="secondary" onPress={() => void allow()} data-testid="allow-site">
              Only {hostOf(offer)}
            </Button>
          )}
        </span>
      </Alert.Content>
    </Alert>
  );
}
