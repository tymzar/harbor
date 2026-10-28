import { describe, expect, it } from "vitest";

import { judge, matchesAnchor, resolveAnchor } from "./anchors";
import type { Observation } from "./anchors";
import type { ScanNode } from "./types";

const node = (id: string, parent: string | undefined, extra: Partial<ScanNode>): ScanNode => ({
  id,
  parent,
  depth: 0,
  tag: "div",
  role: undefined,
  kind: "group",
  text: "",
  rect: { x: 0, y: 0, w: 10, h: 10 },
  sensitive: false,
  ...extra,
});

// Shaped like GitHub's repository page (collected 28 Oct).
const nodes = [
  node("n1", undefined, { tag: "nav", kind: "landmark", text: "Code Issues 882 ( 882 ) Pull requests", attrs: { "aria-label": "Repository" } }),
  node("n2", "n1", { tag: "a", kind: "interactive", text: "Issues 882 ( 882 )", href: "/react/react/issues" }),
  node("n3", undefined, { tag: "ul", kind: "list", text: "Notifications Fork Star", attrs: { "data-testid": "repo-header-actions" }, rect: { x: 897, y: 184, w: 351, h: 36 } }),
];

describe("anchors", () => {
  it("ignores digits and case in text, so counters don't break anchors", () => {
    expect(matchesAnchor(nodes[1], { text: "issues 15" })).toBe(true);
  });

  it("requires every given field", () => {
    expect(matchesAnchor(nodes[2], { tag: "ul", attr: { "data-testid": "repo-header-actions" } })).toBe(true);
    expect(matchesAnchor(nodes[2], { tag: "ul", attr: { "data-testid": "other" } })).toBe(false);
    expect(matchesAnchor(nodes[2], { attr: { "data-testid": "repo-header-actions" }, area: { maxX: 500 } })).toBe(false);
  });

  it("resolves text to the deepest element carrying it", () => {
    const { node: found, matches } = resolveAnchor(nodes, { text: "Issues" });
    expect(matches).toBe(2);
    expect(found?.id).toBe("n2");
  });

  it("matches links by path substring", () => {
    expect(resolveAnchor(nodes, { href: "/issues" }).node?.id).toBe("n2");
  });
});

const seen = (extra: Partial<Observation> = {}): Observation => ({ found: true, visible: true, ops: [], coveringOps: [], ...extra });

describe("judge", () => {
  it("passes a hide only when the element is gone, and a keep only when it stays", () => {
    expect(judge("hide", seen(), seen({ visible: false }))).toBe("pass");
    expect(judge("hide", seen(), seen())).toBe("fail");
    expect(judge("keep", seen(), seen({ visible: false }))).toBe("fail");
    expect(judge("keep", seen(), seen())).toBe("pass");
  });

  it("passes emphasize, compact and grid when the element or a covering child carries the operation", () => {
    expect(judge("emphasize", seen(), seen({ ops: ["emphasize"] }))).toBe("pass");
    expect(judge("grid", seen(), seen({ coveringOps: ["grid"] }))).toBe("pass");
    expect(judge("compact", seen(), seen({ ops: ["grid"] }))).toBe("fail");
    expect(judge("emphasize", seen(), seen({ visible: false, ops: ["emphasize"] }))).toBe("fail");
  });

  it("counts a wrapper whose contents were all hidden as hidden", () => {
    expect(judge("hide", seen({ hasContent: true }), seen({ hasContent: false }))).toBe("pass");
    expect(judge("keep", seen({ hasContent: true }), seen({ hasContent: false }))).toBe("fail");
  });

  it("does not score elements it could not find or that were hidden to begin with", () => {
    expect(judge("hide")).toBe("unresolved");
    expect(judge("hide", seen({ visible: false }), seen({ visible: false }))).toBe("not-visible");
  });
});
