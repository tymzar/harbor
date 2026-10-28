import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Chip, Spinner } from "@heroui/react";
import { Magnifier } from "@gravity-ui/icons";

import type { NodeKind, PanelRequest, ScanNode, TabSession } from "../../shared/types";
import { sessionKey } from "../../shared/types";
import { PlanCard } from "./plan-card";
import { NeedsAccess, SiteAccessSwitch } from "./site-access";

const KIND_LABEL: Record<NodeKind, string> = {
  landmark: "Landmarks",
  heading: "Headings",
  interactive: "Controls",
  list: "Lists",
  item: "Items",
  media: "Media",
  group: "Groups",
};

const KIND_COLOR: Record<NodeKind, "accent" | "default" | "success" | "warning"> = {
  landmark: "accent",
  heading: "success",
  interactive: "warning",
  list: "default",
  item: "default",
  media: "default",
  group: "default",
};

// Tests open the panel as a normal tab and point it at a page tab with ?tabId=.
const PINNED_TAB = Number(new URLSearchParams(location.search).get("tabId")) || undefined;

function useActiveTabId() {
  const [tabId, setTabId] = useState<number | undefined>(PINNED_TAB);

  useEffect(() => {
    if (PINNED_TAB !== undefined) return;

    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => setTabId(tab?.id));

    const onActivated = (info: chrome.tabs.OnActivatedInfo) => setTabId(info.tabId);
    chrome.tabs.onActivated.addListener(onActivated);
    return () => chrome.tabs.onActivated.removeListener(onActivated);
  }, []);

  return tabId;
}

function useSession(tabId: number | undefined) {
  const [session, setSession] = useState<TabSession>();

  useEffect(() => {
    setSession(undefined);
    if (tabId === undefined) return;
    const key = sessionKey(tabId);

    void chrome.storage.session
      .get(key)
      .then((stored) => setSession(stored[key] as TabSession | undefined));

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (key in changes) setSession(changes[key].newValue as TabSession | undefined);
    };
    chrome.storage.session.onChanged.addListener(onChanged);
    return () => chrome.storage.session.onChanged.removeListener(onChanged);
  }, [tabId]);

  return session;
}

function NodeRow({ node }: { node: ScanNode }) {
  return (
    <li
      data-testid="scan-node"
      className="flex items-center gap-2 py-1 text-sm"
      style={{ paddingInlineStart: `${Math.min(node.depth, 8) * 12}px` }}
    >
      <Chip size="sm" variant="soft" color={KIND_COLOR[node.kind]}>
        {node.tag}
      </Chip>
      <span className="min-w-0 truncate text-muted">
        {node.sensitive ? "Form field, content not read" : node.text || "—"}
      </span>
    </li>
  );
}

export function SidePanel() {
  const tabId = useActiveTabId();
  const session = useSession(tabId);
  const scan = session?.status === "ready" ? session.scan : undefined;
  const isScanning = session?.status === "scanning";

  const counts = useMemo(() => {
    const result = new Map<NodeKind, number>();
    for (const node of scan?.nodes ?? []) result.set(node.kind, (result.get(node.kind) ?? 0) + 1);
    return [...result];
  }, [scan]);

  const requestScan = () => {
    if (tabId === undefined) return;
    const request: PanelRequest = { type: "rescan", tabId };
    void chrome.runtime.sendMessage(request);
  };

  return (
    <main className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <h1 data-testid="extension-panel-title" className="text-lg font-semibold tracking-tight">
          Smart Web
        </h1>
        {isScanning && <Spinner size="sm" aria-label="Reading the page" />}
      </header>

      <Card className="rounded-2xl p-4">
        <Card.Header className="gap-0.5">
          <Card.Title className="truncate text-base" data-testid="page-title">
            {scan?.title || session?.url || "Nothing read yet"}
          </Card.Title>
          <Card.Description className="truncate text-sm text-muted">
            {scan?.url ?? "Click the Smart Web toolbar icon on a page to read it."}
          </Card.Description>
        </Card.Header>

        {scan && session?.screenshot && (
          <img
            data-testid="screenshot"
            src={session.screenshot}
            alt="The visible part of the page when it was read"
            className="mt-3 w-full rounded-xl border border-border"
          />
        )}

        {scan && (
          <Card.Content className="pt-3">
            <dl className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-default/60 px-3 py-2">
                <dt className="text-xs text-muted">Elements</dt>
                <dd data-testid="node-count" className="text-lg font-semibold tabular-nums">
                  {scan.nodes.length}
                </dd>
              </div>
              {counts.map(([kind, count]) => (
                <div key={kind} className="rounded-xl bg-default/60 px-3 py-2">
                  <dt className="text-xs text-muted">{KIND_LABEL[kind]}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{count}</dd>
                </div>
              ))}
            </dl>
          </Card.Content>
        )}

        <Card.Footer className="flex items-center justify-between gap-2 pt-4">
          <span className="text-xs text-muted">
            {scan
              ? `Visible area · ${scan.viewport.w}×${scan.viewport.h} · ${scan.durationMs} ms`
              : ""}
          </span>
          {session?.status !== "restricted" && session?.status !== "needs-access" && (
            <Button
              size="sm"
              variant="primary"
              isDisabled={tabId === undefined}
              isPending={isScanning}
              onPress={requestScan}
            >
              <Magnifier />
              {scan ? "Rescan" : "Scan page"}
            </Button>
          )}
        </Card.Footer>

        {session?.lastOrigin && session.status !== "needs-access" && (
          <div className="border-t border-border pt-3">
            <SiteAccessSwitch origin={session.lastOrigin} />
          </div>
        )}
      </Card>

      {session?.status === "needs-access" && <NeedsAccess tabId={session.tabId} origin={session.lastOrigin} />}

      {scan && session && <PlanCard session={session} />}

      {scan && (scan.truncated || scan.skipped.iframes > 0 || scan.skipped.shadowHosts > 0) && (
        <Alert status="warning" data-testid="scan-gaps">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Parts of this page weren't read</Alert.Title>
            <Alert.Description>
              {[
                scan.truncated && "the element list was cut off",
                scan.skipped.iframes > 0 && `${scan.skipped.iframes} embedded frames`,
                scan.skipped.shadowHosts > 0 && `${scan.skipped.shadowHosts} shadow components`,
              ]
                .filter(Boolean)
                .join(", ")}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {session?.status === "restricted" && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Chrome doesn't allow extensions here</Alert.Title>
            <Alert.Description>
              Browser pages and the Web Store can't be read. Open a regular website.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {session?.status === "error" && (
        <Alert status="danger" data-testid="scan-error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Couldn't read this page</Alert.Title>
            <Alert.Description>{session.error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {scan && (
        <ul aria-label="Elements found" className="flex flex-col">
          {scan.nodes.map((node) => (
            <NodeRow key={node.id} node={node} />
          ))}
        </ul>
      )}
    </main>
  );
}
