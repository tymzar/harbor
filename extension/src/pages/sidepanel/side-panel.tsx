import { memo, useEffect, useState } from "react";
import { Alert, Button, Card, Chip, Spinner } from "@heroui/react";
import { ArrowsRotateRight, Eye, EyeSlash, Gear } from "@gravity-ui/icons";

import { HarborLogo } from "../../components/HarborLogo/harbor-logo";
import type { NodeKind, PageScan, PanelRequest, ScanNode, TabSession } from "../../shared/types";
import { sessionKey, shotKey } from "../../shared/types";
import { Onboarding } from "./onboarding";
import { FlowSteps, PlanCard } from "./plan-card";
import { useProfile } from "./use-profile";
import { NeedsAccess, SiteAccessSwitch } from "./site-access";

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

// The screenshot lives in its own storage entry and only changes with a new scan.
function useScreenshot(tabId: number | undefined, scannedAt: number | undefined) {
  const [screenshot, setScreenshot] = useState<string>();
  useEffect(() => {
    setScreenshot(undefined);
    if (tabId === undefined || scannedAt === undefined) return;
    const key = shotKey(tabId);
    void chrome.storage.session.get(key).then((stored) => setScreenshot(stored[key] as string | undefined));
  }, [tabId, scannedAt]);
  return screenshot;
}

// Every element of the scan, with a Hide button per row (the keyboard path for hiding).
// Collapsed by default and rendered only when opened; re-rendered only for a new scan,
// not on every state change of the session.
const ElementList = memo(
  function ElementList({ scan, tabId }: { scan: PageScan; tabId: number }) {
    const [open, setOpen] = useState(false);
    const hide = (nodeId: string) => {
      const request: PanelRequest = { type: "hide-node", tabId, nodeId };
      void chrome.runtime.sendMessage(request);
    };
    return (
      <details
        className="rounded-xl px-1 py-1 text-xs text-muted"
        onToggle={(event) => setOpen(event.currentTarget.open)}
        data-testid="element-list"
      >
        <summary className="cursor-pointer">All {scan.nodes.length} elements on this page</summary>
        {open && (
          <ul aria-label="Elements found" className="mt-2 flex flex-col">
            {scan.nodes.map((node) => (
              <NodeRow key={node.id} node={node} onHide={() => hide(node.id)} />
            ))}
          </ul>
        )}
      </details>
    );
  },
  (previous, next) => previous.scan.scannedAt === next.scan.scannedAt && previous.tabId === next.tabId
);

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

function NodeRow({ node, onHide }: { node: ScanNode; onHide: () => void }) {
  const name = node.text || node.tag;
  return (
    <li
      data-testid="scan-node"
      className="group flex items-center gap-2 py-1 text-sm"
      style={{ paddingInlineStart: `${Math.min(node.depth, 8) * 12}px` }}
    >
      <Chip size="sm" variant="soft" color={KIND_COLOR[node.kind]}>
        {node.tag}
      </Chip>
      <span className="min-w-0 truncate text-muted">
        {node.sensitive ? "Form field, content not read" : node.text || "—"}
      </span>
      {!node.sensitive && (
        // Keyboard path for hiding: shown on hover, and whenever it has focus.
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={`Hide ${name} on the page`}
          className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onPress={onHide}
        >
          <EyeSlash />
        </Button>
      )}
    </li>
  );
}

const hostOf = (origin: string | undefined) => origin?.replace(/^https?:\/\//, "");

function PanelHeader({ site, busy, status }: { site: string | undefined; busy: boolean; status?: string }) {
  return (
    <header className="flex items-center gap-2">
      <HarborLogo size={32} />
      <h1 data-testid="extension-panel-title" className="text-base font-semibold tracking-tight">
        Harbor
      </h1>
      {(status ?? site) && (
        <Chip size="sm" variant="soft" className="min-w-0 truncate">
          {status ?? site}
        </Chip>
      )}
      <span className="ml-auto flex items-center gap-1">
        {busy && <Spinner size="sm" aria-label="Reading the page" />}
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label="Saved layouts and settings"
          onPress={() => void chrome.runtime.openOptionsPage()}
        >
          <Gear />
        </Button>
      </span>
    </header>
  );
}

// Before anything is read: one action, and what it will and won't read.
function FirstOpen({ onRead, isPending, isDisabled }: { onRead: () => void; isPending: boolean; isDisabled: boolean }) {
  return (
    <Card className="gap-3 rounded-3xl p-3.5">
      <h2 className="text-xl font-semibold tracking-tight">Make this page work your way</h2>
      <p className="text-sm text-muted">
        Harbor reads the part of the page you can see, asks Muse Spark for a layout, and changes nothing until you
        keep it.
      </p>
      <Button variant="primary" onPress={onRead} isPending={isPending} isDisabled={isDisabled} fullWidth>
        <Eye />
        Read this page
      </Button>
      <p className="text-xs text-muted">Runs only when you click. Form fields are never read.</p>
    </Card>
  );
}

// The page Harbor read: one quiet line, not a card. The flow below is the panel's focus.
function PageLine({ scan, screenshot, onRescan, scanning }: { scan: PageScan; screenshot: string | undefined; onRescan: () => void; scanning: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" data-testid="page-title">
          {scan.title || scan.url}
        </p>
        <p className="flex gap-1 text-xs text-muted">
          <span className="min-w-0 truncate">{scan.url}</span>
          <span className="shrink-0">
            · <span data-testid="node-count">{scan.nodes.length}</span> elements
            {screenshot && <span data-testid="screenshot"> · screenshot</span>}
          </span>
        </p>
      </div>
      <Button isIconOnly size="sm" variant="ghost" aria-label="Rescan" onPress={onRescan} isPending={scanning}>
        <ArrowsRotateRight />
      </Button>
    </div>
  );
}

function Warning({ status, title, description, testId }: { status: "warning" | "danger" | "default"; title: string; description?: string; testId?: string }) {
  return (
    <Alert status={status} data-testid={testId} className="rounded-3xl">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        {description && <Alert.Description>{description}</Alert.Description>}
      </Alert.Content>
    </Alert>
  );
}

export function SidePanel() {
  const tabId = useActiveTabId();
  const session = useSession(tabId);
  const scan = session?.status === "ready" ? session.scan : undefined;
  const isScanning = session?.status === "scanning";
  const screenshot = useScreenshot(tabId, scan?.scannedAt);

  const requestScan = () => {
    if (tabId === undefined) return;
    const request: PanelRequest = { type: "rescan", tabId };
    void chrome.runtime.sendMessage(request);
  };

  const harbor = useProfile();
  // First open (nothing stored yet) or Edit: the setup takes the panel until it is finished or skipped.
  const settingUp = harbor.loaded && harbor.onboarding !== "done";
  const unreadable = session?.status === "restricted" || session?.status === "needs-access";
  const gaps =
    scan &&
    [
      scan.truncated && "the element list was cut off",
      scan.skipped.iframes > 0 && `${scan.skipped.iframes} embedded frames`,
      scan.skipped.shadowHosts > 0 && `${scan.skipped.shadowHosts} shadow components`,
    ].filter(Boolean);

  return (
    <main className="flex min-h-full flex-col gap-2.5 bg-background p-3.5">
      <PanelHeader site={settingUp ? undefined : hostOf(session?.lastOrigin)} busy={isScanning} status={settingUp ? "Setting up" : undefined} />

      {settingUp ? (
        <Onboarding initial={harbor.onboarding === "editing" ? harbor.profile : undefined} />
      ) : (scan && session ? (
        <PageLine scan={scan} screenshot={screenshot} onRescan={requestScan} scanning={isScanning} />
      ) : (
        !unreadable && (
          <>
            <FlowSteps step={0} />
            <FirstOpen onRead={requestScan} isPending={isScanning} isDisabled={tabId === undefined} />
          </>
        )
      ))}

      {!settingUp && session?.status === "needs-access" && <NeedsAccess tabId={session.tabId} origin={session.lastOrigin} />}
      {session?.notice && <Warning status="warning" title={session.notice} testId="notice" />}
      {session?.status === "restricted" && (
        <Warning
          status="default"
          title="Chrome doesn't allow extensions here"
          description="Browser pages and the Web Store can't be changed. Open a regular website."
        />
      )}
      {session?.status === "error" && (
        <Warning status="danger" title="Couldn't read this page" description={session.error} testId="scan-error" />
      )}
      {gaps && gaps.length > 0 && (
        <Warning status="default" title="Parts of this page weren't read" description={`${gaps.join(", ")} can't be changed.`} testId="scan-gaps" />
      )}

      {!settingUp && scan && session && <PlanCard session={session} profile={harbor.profile} />}
      {!settingUp && scan && session && (
        <footer className="mt-auto flex flex-col gap-1 border-t border-separator pt-2.5">
          {session.lastOrigin && session.status !== "needs-access" && <SiteAccessSwitch origin={session.lastOrigin} />}
          <ElementList scan={scan} tabId={session.tabId} />
        </footer>
      )}
    </main>
  );
}
