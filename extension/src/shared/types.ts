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
  // Short id and data-* values: candidates for an identity that survives across pages.
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
  error?: string;
  startedAt: number;
  finishedAt?: number;
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
  proposal?: Proposal;
  updatedAt: number;
};

export type PanelRequest =
  | { type: "rescan"; tabId: number }
  | { type: "propose"; tabId: number; includeScreenshot: boolean };

export const sessionKey = (tabId: number) => `session:${tabId}`;
