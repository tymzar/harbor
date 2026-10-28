// Shapes shared by the content script, background worker and side panel.

export type Rect = { x: number; y: number; w: number; h: number };

export type NodeKind =
  | "landmark"
  | "heading"
  | "interactive"
  | "list"
  | "item"
  | "media"
  | "group";

export type ScanNode = {
  // Transient: valid only for this scan of this document.
  id: string;
  parent: string | undefined;
  depth: number;
  tag: string;
  role: string | undefined;
  kind: NodeKind;
  text: string;
  rect: Rect;
  // Form fields and editable regions: never uploaded with text, never transformed.
  sensitive: boolean;
};

export type PageScan = {
  url: string;
  title: string;
  viewport: { w: number; h: number; dpr: number; scrollX: number; scrollY: number };
  nodes: Array<ScanNode>;
  truncated: boolean;
  skipped: { iframes: number; shadowHosts: number; canvases: number };
  durationMs: number;
  scannedAt: number;
};

export type SessionStatus = "scanning" | "ready" | "restricted" | "error";

export type TabSession = {
  tabId: number;
  status: SessionStatus;
  url?: string;
  scan?: PageScan;
  // JPEG data URL of the visible tab, captured right after the scan.
  screenshot?: string;
  error?: string;
  updatedAt: number;
};

export type PanelRequest = { type: "rescan"; tabId: number };

export const sessionKey = (tabId: number) => `session:${tabId}`;
