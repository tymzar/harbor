import { describe, expect, it } from "vitest";

import type { LayoutPlan, PlanGroup } from "./plan";
import { urlPatternMatches, validatePlan } from "./plan";
import type { PageScan, ScanNode } from "./types";

const rect = { x: 0, y: 0, w: 10, h: 10 };

function node(id: string, parent: string | undefined, extra: Partial<ScanNode> = {}): ScanNode {
  return { id, parent, depth: 0, tag: "a", role: undefined, kind: "interactive", text: id, rect, sensitive: false, ...extra };
}

// Shaped like GitHub's repository tab bar (data-tab-item values as observed on 28 Oct).
const tabs = ["code", "issues", "pull-requests", "actions"];
const scan: PageScan = {
  url: "https://github.com/react/react/issues",
  title: "Issues",
  viewport: { w: 1280, h: 800, dpr: 2, scrollX: 0, scrollY: 0 },
  nodes: [
    node("n1", undefined, { tag: "nav", kind: "landmark" }),
    ...tabs.map((tab, index) =>
      node(`n${index + 2}`, "n1", {
        text: tab === "issues" ? "Issues 12" : tab,
        href: `/react/react/${tab}`,
        attrs: { "data-tab-item": tab },
      })
    ),
    node("n6", undefined, { tag: "input", sensitive: true, text: "" }),
  ],
  truncated: false,
  skipped: { iframes: 0, shadowHosts: 0, canvases: 0 },
  durationMs: 1,
  scannedAt: 1,
};

const tabsGroup: PlanGroup = {
  label: "Repository tabs",
  urlPattern: "github.com/{owner}/{repo}/*",
  role: "tabs",
  container: "n1",
  members: ["n2", "n3", "n4", "n5"],
  operation: "none",
  reorderable: true,
  identity: { source: "attribute", attribute: "data-tab-item" },
  reason: "Primary repository navigation",
};

const plan = (groups: Array<PlanGroup>, urlPattern = "github.com/{owner}/{repo}/*"): LayoutPlan => ({
  summary: "",
  template: { urlPattern, pageKind: "repository" },
  groups,
});

describe("urlPatternMatches", () => {
  it.each([
    ["github.com/{owner}/{repo}/*", "https://github.com/react/react", true],
    ["github.com/{owner}/{repo}/*", "https://github.com/react/react/issues/12", true],
    ["github.com/{owner}/{repo}/*", "https://github.com/react", false],
    ["github.com/{owner}/{repo}/*", "https://gitlab.com/react/react", false],
    ["github.com/react/react/*", "https://github.com/torvalds/linux", false],
    ["https://example.com/docs/*", "https://example.com/docs/auth?x=1#y", true],
  ])("%s vs %s", (pattern, url, expected) => {
    expect(urlPatternMatches(pattern, url)).toBe(expected);
  });
});

describe("validatePlan", () => {
  it("accepts tabs identified by a stable attribute", () => {
    expect(validatePlan(plan([tabsGroup]), scan)).toEqual({ accepted: [tabsGroup], errors: [] });
  });

  it("accepts text identity even when a counter changes the label", () => {
    const group = { ...tabsGroup, identity: { source: "text" as const, attribute: "" } };
    expect(validatePlan(plan([group]), scan).errors).toEqual([]);
  });

  it("rejects a template that doesn't match the page", () => {
    const { errors } = validatePlan(plan([tabsGroup], "github.com/torvalds/linux/*"), scan);
    expect(errors[0]).toMatch(/does not match/);
  });

  it("rejects unknown ids, form fields and members outside the container", () => {
    const group = { ...tabsGroup, members: ["n2", "n99", "n6"], reorderable: false };
    const { accepted, errors } = validatePlan(plan([group]), scan);
    expect(accepted).toEqual([]);
    expect(errors.join("\n")).toMatch(/n99 is not a scanned element/);
    expect(errors.join("\n")).toMatch(/n6 is a form field/);
  });

  it("rejects a reorderable group whose identity attribute is missing", () => {
    const group = { ...tabsGroup, identity: { source: "attribute" as const, attribute: "data-missing" } };
    expect(validatePlan(plan([group]), scan).errors[0]).toMatch(/no attribute identity/);
  });

  it("rejects an element claimed by two groups but keeps the first", () => {
    const second = { ...tabsGroup, label: "Again", reorderable: false };
    const { accepted, errors } = validatePlan(plan([tabsGroup, second]), scan);
    expect(accepted).toEqual([tabsGroup]);
    expect(errors.some((error) => error.includes("already belongs"))).toBe(true);
  });

  it("rejects a grid of one", () => {
    const group = { ...tabsGroup, members: ["n2"], operation: "grid" as const, reorderable: false };
    expect(validatePlan(plan([group]), scan).errors[0]).toMatch(/grid needs at least 2/);
  });

  it("accepts a single element as its own region (a group the user picked)", () => {
    const picked = { ...tabsGroup, label: "Hidden by you: Issues", container: "n3", members: ["n3"], operation: "hide-secondary" as const, reorderable: false, origin: "user" as const };
    expect(validatePlan(plan([picked]), scan).errors).toEqual([]);
  });
});
