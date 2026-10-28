// Shapes shared by the content script, background worker and side panel.

import type { LayoutPlan, PlanGroup } from "./plan";
import type { VisualGroup } from "./prompt";

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
  // Link path without query or fragment, which can carry tokens.
  href?: string;
  // Short id, aria-label and data-* values: candidates for an identity that survives across pages.
  attrs?: Record<string, string>;
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

export type CallLog = {
  model: string;
  purpose: string;
  ms: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  matches?: number;
};

export type ProposalStep = "segmenting" | "matching" | "planning" | "repairing";

export type Proposal = {
  status: "running" | "done" | "error";
  step?: ProposalStep;
  // The scan this proposal was built from; a rescan makes it stale.
  scannedAt: number;
  usedScreenshot: boolean;
  calls: Array<CallLog>;
  visualGroups?: Array<VisualGroup>;
  plan?: LayoutPlan;
  accepted?: Array<PlanGroup>;
  // Validator errors on the final plan (after the one repair attempt, if any).
  errors?: Array<string>;
  repaired: boolean;
  // Set when this plan was loaded from storage instead of asking Meta.
  reused?: { match: "page" | "template"; savedAt: number; fromUrl: string };
  error?: string;
  startedAt: number;
  finishedAt?: number;
};

// What is currently changed on the page. Groups are named by label: indices change on rescan.
export type LayoutState = {
  state: "preview" | "applied";
  labels: Array<string>;
  // Groups whose elements had gone from the page when applying.
  missing: Array<string>;
};

// needs-access: Chrome withdrew the page grant (usually after a full page load).
export type SessionStatus = "scanning" | "ready" | "restricted" | "needs-access" | "error";

export type TabSession = {
  tabId: number;
  status: SessionStatus;
  url?: string;
  scan?: PageScan;
  // JPEG data URL of the visible tab, captured right after the scan.
  screenshot?: string;
  error?: string;
  layout?: LayoutState;
  // The site this tab was last read on; Chrome hides the URL once access is gone.
  lastOrigin?: string;
  proposal?: Proposal;
  updatedAt: number;
};

export type PanelRequest =
  | { type: "rescan"; tabId: number }
  | { type: "propose"; tabId: number; includeScreenshot: boolean }
  | { type: "forget"; tabId: number }
  | { type: "layout"; tabId: number; action: "preview" | "apply" | "restore"; labels?: Array<string> }
  // From the page: Escape during a preview already restored it.
  | { type: "page-restored" };

export const sessionKey = (tabId: number) => `session:${tabId}`;
