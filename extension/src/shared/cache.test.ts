import { describe, expect, it } from "vitest";

import { findSavedPlan, pageKey, remapPlan, savePlan } from "./cache";
import type { LayoutPlan } from "./plan";
import { validatePlan } from "./plan";
import type { PageScan, ScanNode } from "./types";

function repoScan(repo: string, tabs: Array<string>, offset = 0): PageScan {
  // Unrelated elements first, so IDs shift between pages.
  const nodes: Array<ScanNode> = Array.from({ length: offset }, (_, index) => ({
      id: `n${index + 1}`,
      parent: undefined,
      depth: 0,
      tag: "div",
      role: undefined,
      kind: "group" as const,
      text: `banner ${index}`,
      rect: { x: 0, y: index * 10, w: 100, h: 10 },
      sensitive: false,
    }));
  const navId = `n${nodes.length + 1}`;
  nodes.push({
    id: navId,
    parent: undefined,
    depth: 0,
    tag: "nav",
    role: undefined,
    kind: "landmark",
    text: tabs.join(" "),
    rect: { x: 0, y: 50, w: 800, h: 40 },
    sensitive: false,
    attrs: { "aria-label": "Repository" },
  });
  for (const [index, tab] of tabs.entries())
    nodes.push({
      id: `n${nodes.length + 1}`,
      parent: navId,
      depth: 1,
      tag: "a",
      role: undefined,
      kind: "interactive",
      text: tab === "issues" ? `Issues ${repo.length}` : tab,
      rect: { x: index * 90, y: 50, w: 80, h: 40 },
      sensitive: false,
      href: `/${repo}/${tab}`,
      attrs: { "data-tab-item": tab },
    });
  return {
    url: `https://github.com/${repo}/pulls`,
    title: repo,
    viewport: { w: 1280, h: 800, dpr: 2, scrollX: 0, scrollY: 0 },
    nodes,
    truncated: false,
    skipped: { iframes: 0, shadowHosts: 0, canvases: 0 },
    durationMs: 1,
    scannedAt: 1,
  };
}

const react = repoScan("react/react", ["code", "issues", "pull-requests", "actions"]);
const plan: LayoutPlan = {
  summary: "Repository page",
  template: { urlPattern: "github.com/{owner}/{repo}/*", pageKind: "repository" },
  groups: [
    {
      label: "Repository tabs",
      urlPattern: "github.com/{owner}/{repo}/*",
      role: "tabs",
      container: "n1",
      members: ["n2", "n3", "n4", "n5"],
      operation: "none",
      reorderable: true,
      identity: { source: "attribute", attribute: "data-tab-item" },
      reason: "",
    },
  ],
};

describe("saved plans", () => {
  const saved = savePlan(plan, react, false, 100);

  it("keys pages without query, fragment or trailing slash", () => {
    expect(pageKey("https://github.com/react/react/?tab=x#top")).toBe("https://github.com/react/react");
  });

  it("finds the same page first, then any page its template covers", () => {
    const other = { ...saved, url: "https://github.com/a/b", savedAt: 200 };
    expect(findSavedPlan([saved, other], "https://github.com/react/react/pulls")?.match).toBe("page");
    expect(findSavedPlan([saved], "https://github.com/torvalds/linux")?.match).toBe("template");
    expect(findSavedPlan([saved], "https://gitlab.com/x/y")).toBeUndefined();
  });

  it("re-finds nodes when the same page's IDs shift", () => {
    const later = repoScan("react/react", ["code", "issues", "pull-requests", "actions"], 3);
    const remapped = remapPlan(saved, later);
    expect(remapped.groups[0].container).toBe("n4");
    expect(remapped.groups[0].members).toEqual(["n5", "n6", "n7", "n8"]);
    expect(validatePlan(remapped, later).errors).toEqual([]);
  });

  it("carries tabs to another repo by identity, dropping tabs that repo doesn't have", () => {
    const linux = repoScan("torvalds/linux", ["code", "actions", "projects"]);
    const remapped = remapPlan(saved, linux);
    const names = remapped.groups[0].members.map((id) => linux.nodes.find((node) => node.id === id)?.attrs?.["data-tab-item"]);
    expect(names).toEqual(["code", "actions"]);
    expect(validatePlan(remapped, linux).errors).toEqual([]);
  });

  it("keeps a view-specific group to its own view, and takes another repo's own rows", () => {
    // react/react code page: tabs (all repo pages) plus a file list (code page only).
    const code: PageScan = {
      ...react,
      url: "https://github.com/react/react",
      nodes: [
        ...react.nodes,
        { ...react.nodes[0], id: "n6", tag: "table", kind: "list", text: "README.md src package.json", attrs: { "aria-label": "Folders and files" }, rect: { x: 0, y: 200, w: 800, h: 300 } },
        ...["README.md", "src", "package.json"].map((name, index) => ({
          ...react.nodes[1],
          id: `n${7 + index}`,
          parent: "n6",
          tag: "tr",
          kind: "item" as const,
          text: name,
          href: undefined,
          attrs: undefined,
          rect: { x: 0, y: 200 + index * 30, w: 800, h: 30 },
        })),
      ],
    };
    const files = {
      label: "File list",
      urlPattern: "github.com/{owner}/{repo}",
      role: "list" as const,
      container: "n6",
      members: ["n7", "n8", "n9"],
      operation: "compact" as const,
      reorderable: false,
      identity: { source: "none" as const, attribute: "" },
      reason: "",
    };
    const saved = savePlan({ ...plan, groups: [plan.groups[0], files] }, code, false, 100);
    expect(saved.rows).toEqual([undefined, { tag: "tr", kind: "item" }]);

    // Issues page of the same repo: only the tabs apply.
    expect(remapPlan(saved, react).groups.map((group) => group.label)).toEqual(["Repository tabs"]);

    // Code page of another repo: its own two files, not react's names.
    const linuxCode: PageScan = {
      ...code,
      url: "https://github.com/torvalds/linux",
      nodes: [
        ...code.nodes.slice(0, 6),
        ...["Kconfig", "MAINTAINERS"].map((name, index) => ({ ...code.nodes[6], id: `n${7 + index}`, text: name })),
      ],
    };
    const remapped = remapPlan(saved, linuxCode);
    expect(remapped.groups.find((group) => group.label === "File list")?.members).toEqual(["n7", "n8"]);
    expect(validatePlan(remapped, linuxCode).errors).toEqual([]);
  });
});
