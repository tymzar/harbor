import { describe, expect, it } from "vitest";

import type { SavedPlan } from "./cache";
import { savePlan, siteOf, transferGroups } from "./cache";
import type { LayoutPlan, PlanGroup } from "./plan";
import type { NodeKind, PageScan, ScanNode } from "./types";

// Two pages of one site, shaped like LinkedIn: the same top bar over different content. The feed's
// plan names a pattern that does not cover the messaging page; the bar must follow all the same.
type Spec = { tag: string; kind: NodeKind; text?: string; href?: string; attrs?: Record<string, string>; rect?: [number, number, number, number]; kids?: Array<Spec> };

function page(url: string, specs: Array<Spec>): PageScan {
  const nodes: Array<ScanNode> = [];
  const add = (spec: Spec, parent: string | undefined, depth: number) => {
    const id = `n${nodes.length + 1}`;
    const [x, y, w, h] = spec.rect ?? [0, nodes.length * 20, 400, 20];
    nodes.push({ id, parent, depth, tag: spec.tag, role: undefined, kind: spec.kind, text: spec.text ?? "", rect: { x, y, w, h }, sensitive: false, href: spec.href, attrs: spec.attrs });
    for (const kid of spec.kids ?? []) add(kid, id, depth + 1);
  };
  for (const spec of specs) add(spec, undefined, 0);
  return { url, title: "", viewport: { w: 1280, h: 800, dpr: 1, scrollX: 0, scrollY: 0 }, nodes, truncated: false, skipped: { iframes: 0, shadowHosts: 0, canvases: 0 }, durationMs: 1, scannedAt: 1 };
}

const bar = (y = 0): Spec => ({
  tag: "header",
  kind: "landmark",
  text: "Home Jobs Messaging",
  rect: [0, y, 1280, 60],
  kids: [
    {
      tag: "nav",
      kind: "landmark",
      text: "Home Jobs Messaging",
      attrs: { "aria-label": "Primary" },
      rect: [0, y, 1280, 60],
      kids: ["Home", "Jobs", "Messaging"].map((label, index) => ({ tag: "a", kind: "interactive" as const, text: label, href: `/${label.toLowerCase()}`, rect: [index * 100, y + 10, 90, 40] })),
    },
  ],
});

const feed = page("https://www.news.example/feed/", [
  bar(),
  {
    tag: "main",
    kind: "landmark",
    text: "Latest",
    rect: [0, 80, 1280, 700],
    kids: [
      { tag: "h2", kind: "heading", text: "Latest", rect: [20, 90, 800, 40] },
      {
        tag: "div",
        kind: "group",
        text: "Rates rise",
        rect: [20, 140, 800, 400],
        kids: ["Rates rise", "Storm warning", "Cup final"].map((title, index) => ({ tag: "article", kind: "landmark" as const, text: title, rect: [20, 140 + index * 100, 800, 90], kids: [{ tag: "h3", kind: "heading" as const, text: title }] })),
      },
    ],
  },
]);

const messaging = (barAt = 0) =>
  page("https://news.example/messaging/thread/2-NTE1==/", [
    bar(barAt),
    {
      tag: "main",
      kind: "landmark",
      text: "Inbox",
      rect: [0, 80, 1280, 700],
      kids: [
        { tag: "h1", kind: "heading", text: "Inbox", rect: [20, 90, 800, 40] },
        { tag: "table", kind: "list", text: "Ana Ben", rect: [20, 140, 400, 600], kids: ["Ana", "Ben"].map((name, index) => ({ tag: "tr", kind: "item" as const, text: name, rect: [20, 140 + index * 50, 400, 50] })) },
      ],
    },
  ]);

const byText = (scan: PageScan, text: string, tag: string) => scan.nodes.find((node) => node.text === text && node.tag === tag)!;
const nav = byText(feed, "Home Jobs Messaging", "nav");
const list = byText(feed, "Rates rise", "div");
const group = (label: string, container: string, operation: PlanGroup["operation"], urlPattern: string): PlanGroup => ({
  label,
  urlPattern,
  role: "other",
  container,
  members: feed.nodes.filter((node) => node.parent === container).map((node) => node.id),
  operation,
  reorderable: false,
  identity: { source: "none", attribute: "" },
  reason: "",
});
const plan = (groups: Array<PlanGroup>, template = "news.example/feed/*"): LayoutPlan => ({ summary: "Feed", template: { urlPattern: template, pageKind: "feed" }, groups });
const labels = (found: ReturnType<typeof transferGroups>) => found.map(({ group }) => group.label);

describe("transferring saved groups by structure", () => {
  const feedPlan = savePlan(plan([group("Top bar", nav.id, "emphasize", "news.example/feed/*"), group("Posts", list.id, "compact", "news.example/feed/*")]), feed, false, 100);

  it("finds the feed's top bar on a messaging page its pattern does not name, ignoring www.", () => {
    const found = transferGroups([feedPlan], undefined, messaging());
    expect(labels(found)).toEqual(["Top bar"]);
    expect(found[0].fromUrl).toBe("https://www.news.example/feed");
    // Rewritten to this page's elements and the site-wide pattern, so it validates here.
    expect(found[0].group.container).toBe(byText(messaging(), "Home Jobs Messaging", "nav").id);
    expect(found[0].group.urlPattern).toBe("news.example/*");
  });

  it("leaves other sites' plans alone", () => {
    const elsewhere = { ...feedPlan, url: "https://other.example/feed" };
    expect(transferGroups([elsewhere], undefined, messaging())).toEqual([]);
    expect(siteOf("https://www.news.example/feed")).toBe("news.example");
  });

  it("skips the plan the page already uses and takes each label once, newest plan first", () => {
    const older = { ...feedPlan, savedAt: 50, url: "https://news.example/jobs" };
    expect(transferGroups([feedPlan, older], feedPlan, messaging()).map(({ fromUrl }) => fromUrl)).toEqual(["https://news.example/jobs"]);
    expect(transferGroups([older, feedPlan], undefined, messaging()).map(({ fromUrl }) => fromUrl)).toEqual(["https://www.news.example/feed"]);
  });

  it("takes a region found elsewhere on the page only when its pattern already covers the page", () => {
    // The bar sits lower on this page: found, but not where it was.
    const moved = messaging(300);
    expect(transferGroups([feedPlan], undefined, moved)).toEqual([]);
    const siteWide = savePlan(plan([group("Top bar", nav.id, "emphasize", "news.example/*")]), feed, false, 100);
    expect(labels(transferGroups([siteWide], undefined, moved))).toEqual(["Top bar"]);
    const named = savePlan(plan([group("Top bar", nav.id, "emphasize", "news.example/messaging/*")]), feed, false, 100);
    expect(labels(transferGroups([named], undefined, moved))).toEqual(["Top bar"]);
  });

  it("matches plans saved before region fingerprints element by element, site-wide groups only", () => {
    const legacy: SavedPlan = { ...savePlan(plan([group("Top bar", nav.id, "emphasize", "news.example/*"), group("Posts", list.id, "compact", "news.example/feed/*")]), feed, false, 100), regions: undefined };
    const found = transferGroups([legacy], undefined, messaging());
    expect(labels(found)).toEqual(["Top bar"]);
    const narrow: SavedPlan = { ...legacy, plan: plan([group("Top bar", nav.id, "emphasize", "news.example/feed/*")]) };
    expect(transferGroups([narrow], undefined, messaging())).toEqual([]);
  });
});
