import { useEffect, useState } from "react";
import { Alert, Button, Switch } from "@heroui/react";

import type { PanelRequest } from "../../shared/types";

// Persistent access to one site, granted only through Chrome's own prompt. Without it,
// Smart Web keeps a page only until the tab loads a new document (activeTab).
const pattern = (origin: string) => `${origin}/*`;
const hostOf = (origin: string) => origin.replace(/^https?:\/\//, "");

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

function rescan(tabId: number) {
  const message: PanelRequest = { type: "rescan", tabId };
  void chrome.runtime.sendMessage(message);
}

export function SiteAccessSwitch({ origin }: { origin: string }) {
  const { granted, request, revoke } = useSiteAccess(origin);
  if (!/^https?:/.test(origin)) return;

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

export function NeedsAccess({ tabId, origin }: { tabId: number; origin: string | undefined }) {
  const { request } = useSiteAccess(origin);

  const allow = async () => {
    if (await request()) rescan(tabId);
  };

  return (
    <Alert status="warning" data-testid="needs-access">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>This page loaded after Smart Web last read it</Alert.Title>
        <Alert.Description>
          Chrome ends Smart Web's access when a tab loads a new page. Click the toolbar icon to read it
          {origin ? `, or let Smart Web follow you on ${hostOf(origin)}.` : "."}
        </Alert.Description>
        {origin && /^https?:/.test(origin) && (
          <Button size="sm" variant="primary" className="mt-2" onPress={() => void allow()} data-testid="allow-site">
            Allow on {hostOf(origin)}
          </Button>
        )}
      </Alert.Content>
    </Alert>
  );
}
