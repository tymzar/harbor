import type { NodeKind, ScanNode } from "./types";

// Anchors name a region of a real page for the evaluation set (../evaluation): what a person
// would point at, written so it survives the page's markup changing between visits. Every field
// given must hold; text and href are case-insensitive substrings, whitespace and digits ignored
// in text so counters ("Issues 882") don't break them.
export type Anchor = {
  tag?: string;
  kind?: NodeKind;
  text?: string;
  textStart?: string;
  href?: string;
  attr?: Record<string, string>;
  // Viewport CSS pixels of the node's top-left corner, for anchors that are ambiguous otherwise.
  area?: { minX?: number; maxX?: number; minY?: number; maxY?: number };
};

export type ExpectedOp = "hide" | "emphasize" | "compact" | "grid" | "keep";

export type Expectation = { op: ExpectedOp; anchor: Anchor; note?: string };

export type Scenario = {
  id: string;
  site: string;
  // What the user types into "I come here to..."; absent for picker scenarios.
  goal?: string;
  // Picker scenarios: the element the user clicks with "Hide something else".
  pick?: Anchor;
  expect: Array<Expectation>;
  tags: Array<string>;
  // Sites that block automated browsers; run by hand in a normal Chrome profile.
  requires?: "real-browser";
};

const normal = (text: string) => text.toLowerCase().replaceAll(/\d+/g, "").replaceAll(/\s+/g, " ").trim();

export function matchesAnchor(node: ScanNode, anchor: Anchor): boolean {
  if (anchor.tag && node.tag !== anchor.tag.toLowerCase()) return false;
  if (anchor.kind && node.kind !== anchor.kind) return false;
  if (anchor.text && !normal(node.text).includes(normal(anchor.text))) return false;
  if (anchor.textStart && !normal(node.text).startsWith(normal(anchor.textStart))) return false;
  if (anchor.href && !(node.href ?? "").toLowerCase().includes(anchor.href.toLowerCase())) return false;
  for (const [name, value] of Object.entries(anchor.attr ?? {})) if (node.attrs?.[name] !== value) return false;
  const { area } = anchor;
  if (area) {
    const { x, y } = node.rect;
    if ((area.minX !== undefined && x < area.minX) || (area.maxX !== undefined && x > area.maxX)) return false;
    if ((area.minY !== undefined && y < area.minY) || (area.maxY !== undefined && y > area.maxY)) return false;
  }
  return true;
}

// The anchor's node: the deepest match, so a text anchor names the element that carries the
// text rather than every ancestor that contains it.
export function resolveAnchor(nodes: Array<ScanNode>, anchor: Anchor): { node?: ScanNode; matches: number } {
  const matches = nodes.filter((node) => matchesAnchor(node, anchor));
  const ids = new Set(matches.map((node) => node.id));
  const deepest = matches.find((node) => !matches.some((other) => other.parent === node.id || isBelow(other, node.id, nodes, ids)));
  return { node: deepest ?? matches[0], matches: matches.length };
}

function isBelow(node: ScanNode, ancestorId: string, nodes: Array<ScanNode>, among: Set<string>): boolean {
  const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  for (let current = node.parent; current; current = byId.get(current)?.parent)
    if (current === ancestorId) return among.has(node.id);
  return false;
}

// What the page showed for an anchor's element before and after Smart Web changed it
// (content/inspect.ts). ops: operations marked on the element or an ancestor; coveringOps: on a
// descendant covering most of it. hasContent: still shows visible text or media (absent in
// results from before 29 Oct).
export type Observation = {
  found: boolean;
  visible: boolean;
  hasContent?: boolean;
  ops: Array<string>;
  coveringOps: Array<string>;
};

export type Verdict = "pass" | "fail" | "unresolved" | "not-visible";

// On screen: visible, and not an empty wrapper whose contents were all hidden.
const onScreen = (observation: Observation) => observation.visible && observation.hasContent !== false;

// unresolved: the anchor names nothing on this visit's scan (the site changed).
// not-visible: the element showed nothing before any change, so the check says nothing.
export function judge(op: ExpectedOp, before?: Observation, after?: Observation): Verdict {
  if (!before?.found || !after) return "unresolved";
  if (!onScreen(before)) return "not-visible";
  if (op === "hide") return onScreen(after) ? "fail" : "pass";
  if (op === "keep") return onScreen(after) ? "pass" : "fail";
  const marked = after.ops.includes(op) || after.coveringOps.includes(op);
  return onScreen(after) && marked ? "pass" : "fail";
}
