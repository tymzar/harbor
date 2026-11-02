import { describe, expect, it } from "vitest";

import type { SavedPlan } from "./cache";
import { remapPlan, remapRegions, savePlan } from "./cache";
import type { LayoutPlan } from "./plan";
import { validatePlan } from "./plan";
import { alignSkeleton, dice, findRows, pageChanged, pagePrint, shapeOf, treeOf } from "./region";
import type { NodeKind, PageScan, ScanNode } from "./types";

// A small page: header nav, a "Latest" heading, a list of articles, a "Sponsored" sidebar.
type Spec = { tag: string; kind: NodeKind; text?: string; href?: string; attrs?: Record<string, string>; rect?: [number, number, number, number]; kids?: Array<Spec> };

function page(specs: Array<Spec>): PageScan {
  const nodes: Array<ScanNode> = [];
  const add = (spec: Spec, parent: string | undefined, depth: number) => {
    const id = `n${nodes.length + 1}`;
    const [x, y, w, h] = spec.rect ?? [0, nodes.length * 20, 400, 20];
    nodes.push({ id, parent, depth, tag: spec.tag, role: undefined, kind: spec.kind, text: spec.text ?? "", rect: { x, y, w, h }, sensitive: false, href: spec.href, attrs: spec.attrs });
    for (const kid of spec.kids ?? []) add(kid, id, depth + 1);
  };
  for (const spec of specs) add(spec, undefined, 0);
  return {
    url: "https://news.example/front",
    title: "",
    viewport: { w: 1280, h: 800, dpr: 1, scrollX: 0, scrollY: 0 },
    nodes,
    truncated: false,
    skipped: { iframes: 0, shadowHosts: 0, canvases: 0 },
    durationMs: 1,
    scannedAt: 1,
  };
}

const words = { en: ["Home", "World", "Sport", "Latest", "Sponsored", "Read more"], de: ["Startseite", "Welt", "Sport!", "Neueste", "Gesponsert", "Weiterlesen"] };

function front(options: { lang?: "en" | "de"; wrapRows?: boolean; stories?: Array<string>; redesignSidebar?: boolean } = {}): PageScan {
  const [home, world, sport, latest, sponsored, more] = words[options.lang ?? "en"];
  const stories = options.stories ?? ["Rates rise", "Storm warning", "Cup final", "New bridge"];
  const rows: Array<Spec> = stories.map((title, index) => ({
    tag: "article",
    kind: "landmark",
    text: `${title} ${more}`,
    rect: [20, 140 + index * 100, 800, 90],
    kids: [
      { tag: "h3", kind: "heading", text: title, rect: [20, 140 + index * 100, 800, 30] },
      { tag: "a", kind: "interactive", text: more, href: `/story/${title.toLowerCase().replaceAll(" ", "-")}`, rect: [20, 180 + index * 100, 120, 20] },
    ],
  }));
  const list: Spec = options.wrapRows
    ? { tag: "div", kind: "group", text: rows[0].text, rect: [20, 140, 800, 400], kids: [{ tag: "div", kind: "group", text: rows[0].text, rect: [20, 140, 800, 400], kids: rows }] }
    : { tag: "div", kind: "group", text: rows[0].text, rect: [20, 140, 800, 400], kids: rows };
  const sidebar: Spec = options.redesignSidebar
    ? { tag: "div", kind: "group", text: "Picks for you", rect: [900, 140, 300, 300], kids: [{ tag: "h3", kind: "heading", text: "Picks for you" }, { tag: "img", kind: "media" }] }
    : {
        tag: "aside",
        kind: "landmark",
        text: sponsored,
        attrs: { "aria-label": sponsored },
        rect: [900, 140, 300, 300],
        kids: [
          { tag: "a", kind: "interactive", text: "Buy shoes", href: "ads.example/1", rect: [900, 160, 300, 100] },
          { tag: "a", kind: "interactive", text: "Cheap flights", href: "ads.example/2", rect: [900, 270, 300, 100] },
        ],
      };
  return page([
    {
      tag: "header",
      kind: "landmark",
      text: `${home} ${world} ${sport}`,
      rect: [0, 0, 1280, 60],
      kids: [
        {
          tag: "nav",
          kind: "landmark",
          text: `${home} ${world} ${sport}`,
          attrs: { "aria-label": home },
          rect: [0, 0, 1280, 60],
          kids: [home, world, sport].map((label, index) => ({ tag: "a", kind: "interactive" as const, text: label, href: `/${["", "world", "sport"][index]}`, rect: [index * 100, 10, 90, 40] })),
        },
      ],
    },
    {
      tag: "main",
      kind: "landmark",
      rect: [0, 80, 1280, 700],
      text: latest,
      kids: [{ tag: "h2", kind: "heading", text: latest, rect: [20, 90, 800, 40] }, list, sidebar],
    },
  ]);
}

const byText = (scan: PageScan, text: string, tag?: string) => scan.nodes.find((node) => node.text === text && (!tag || node.tag === tag))!;
const base = front();
const list = base.nodes.find((node) => node.tag === "div" && node.parent === byText(base, "Latest", "main").id)!;
const rows = base.nodes.filter((node) => node.parent === list.id);
const aside = byText(base, "Sponsored", "aside");
const plan: LayoutPlan = {
  summary: "",
  template: { urlPattern: "news.example/*", pageKind: "front" },
  groups: [
    { label: "Stories", urlPattern: "news.example/*", role: "content-cards", container: list.id, members: rows.map((row) => row.id), operation: "grid", reorderable: false, identity: { source: "none", attribute: "" }, reason: "" },
    { label: "Ads", urlPattern: "news.example/*", role: "promo", container: aside.id, members: base.nodes.filter((node) => node.parent === aside.id).map((node) => node.id), operation: "hide-secondary", reorderable: false, identity: { source: "none", attribute: "" }, reason: "" },
    { label: "Cup final", urlPattern: "news.example/*", role: "other", container: list.id, members: [rows[2].id], operation: "hide-secondary", reorderable: false, identity: { source: "none", attribute: "" }, reason: "", origin: "user" },
  ],
};
const saved = savePlan(plan, base, false, 1);
const labels = (result: LayoutPlan) => result.groups.map((group) => group.label);
const band = (scan: PageScan, label: string) => remapRegions(saved, scan).report.find((entry) => entry.label === label)?.band;

describe("region fingerprints", () => {
  it("are saved with the plan and change nothing on the same page", () => {
    expect(saved.regions).toHaveLength(3);
    expect(saved.page?.skeleton.length).toBeGreaterThan(0);
    const remap = remapRegions(saved, base);
    expect(labels(remap.plan)).toEqual(["Stories", "Ads", "Cup final"]);
    expect(remap.report.every((entry) => entry.band === "same")).toBe(true);
    expect(remap.changed).toEqual({ skeleton: false, structure: false });
  });

  it("find the rows again behind a new wrapper, where the element matcher loses them", () => {
    const wrapped = front({ wrapRows: true });
    const legacy: SavedPlan = { ...saved, regions: undefined, page: undefined };
    expect(labels(remapPlan(legacy, wrapped))).not.toContain("Stories");
    const stories = remapPlan(saved, wrapped).groups.find((group) => group.label === "Stories")!;
    expect(stories.members.map((id) => wrapped.nodes.find((node) => node.id === id)?.tag)).toEqual(["article", "article", "article", "article"]);
    expect(validatePlan(remapPlan(saved, wrapped), wrapped).errors).toEqual([]);
    expect(pageChanged(saved.page, pagePrint(wrapped)).structure).toBe(true);
  });

  it("survive a translated page by structure, place and links", () => {
    const german = front({ lang: "de" });
    const legacy: SavedPlan = { ...saved, regions: undefined, page: undefined };
    expect(labels(remapPlan(legacy, german))).not.toContain("Ads");
    const remap = remapRegions(saved, german);
    expect(labels(remap.plan)).toContain("Ads");
    expect(remap.plan.groups.find((group) => group.label === "Ads")?.container).toBe(byText(german, "Gesponsert", "aside").id);
    expect(remap.changed.skeleton).toBe(true);
  });

  it("report a redesigned region as lost instead of hiding something else", () => {
    const redesigned = front({ redesignSidebar: true });
    expect(labels(remapPlan(saved, redesigned))).not.toContain("Ads");
    expect(band(redesigned, "Ads")).toBe("lost");
  });

  it("don't hide a removed story's neighbour", () => {
    const fewer = front({ stories: ["Rates rise", "Storm warning", "New bridge"] });
    const result = remapPlan(saved, fewer);
    expect(labels(result)).not.toContain("Cup final");
    expect(result.groups.find((group) => group.label === "Stories")?.members).toHaveLength(3);
  });

  it("keep matching plans saved before fingerprints, element by element", () => {
    const legacy: SavedPlan = { ...saved, regions: undefined, page: undefined };
    expect(labels(remapPlan(legacy, base))).toEqual(["Stories", "Ads", "Cup final"]);
  });

  it("align a reworded skeleton: exact anchors first, then same-type anchors between them", () => {
    const german = front({ lang: "de" });
    const tree = treeOf(german);
    const mapped = alignSkeleton(saved.page!.skeleton, tree);
    const headings = tree.anchors.filter((anchor) => anchor.kind === "heading").map((anchor) => anchor.id);
    // Every saved anchor finds a partner; the h2 maps to the h2.
    expect(mapped.size).toBe(saved.page!.skeleton.length);
    expect(mapped.get(saved.page!.skeleton.findIndex((key) => key.startsWith("h2|")))).toBe(headings[0]);
  });

  it("compare token sets with the Dice coefficient", () => {
    expect(dice(["a", "b"], ["a", "b"])).toBe(1);
    expect(dice(["a", "b"], ["c"])).toBe(0);
    expect(dice(["a", "b", "c", "d"], ["a", "b"])).toBeCloseTo(2 / 3);
  });
});

// Rows that have the same tag and kind as the wrapper the site put around some of them (a <div>
// around a run of <div> rows): the wrapper is not a row, the rows inside it are.
const card = (title: string, y: number): Spec => ({
  tag: "div",
  kind: "group",
  text: title,
  rect: [20, y, 800, 90],
  kids: [{ tag: "h3", kind: "heading", text: title }, { tag: "a", kind: "interactive", text: "Read more", href: `/${title}` }],
});
const replies = (title: string, y: number): Spec => ({ ...card(title, y), kids: [card(`${title} a`, y), card(`${title} b`, y + 45)] });
const titles = ["Rates rise", "Storm warning", "Cup final", "New bridge", "Late goal"];
const cards = () => titles.map((title, index) => card(title, 140 + index * 100));
const textsOf = (scan: PageScan, found: Array<string>) => found.map((id) => scan.nodes.find((node) => node.id === id)!.text);
const listOf = (kids: Array<Spec>) => page([{ tag: "div", kind: "group", text: "Rates rise", rect: [20, 140, 800, 500], kids }]);
const rowShape = { tag: "div", kind: "group" as NodeKind };

describe("findRows with a same-tag wrapper", () => {
  const before = listOf(cards());
  const print = shapeOf(treeOf(before), "n2");

  it("takes the rows inside a wrapper around a run of them, not the wrapper", () => {
    const rows = cards();
    const wrapped = listOf([rows[0], { tag: "div", kind: "group", text: "Storm warning Cup final New bridge", rect: [20, 240, 800, 290], kids: rows.slice(1, 4) }, rows[4]]);
    for (const saved of [undefined, print]) expect(textsOf(wrapped, findRows(treeOf(wrapped), "n1", rowShape, saved))).toEqual(titles);
  });

  it("takes the rows inside a wrapper around all of them, even a small one", () => {
    const wrapped = listOf([{ tag: "div", kind: "group", text: "Rates rise", rect: [20, 140, 300, 200], kids: cards() }]);
    for (const saved of [undefined, print]) expect(textsOf(wrapped, findRows(treeOf(wrapped), "n1", rowShape, saved))).toEqual(titles);
  });

  it("keeps rows that each hold same-tag parts as rows", () => {
    const scan = listOf(titles.slice(0, 3).map((title, index) => replies(title, 140 + index * 100)));
    expect(textsOf(scan, findRows(treeOf(scan), "n1", rowShape))).toEqual(titles.slice(0, 3));
    const nestedPrint = shapeOf(treeOf(scan), "n2");
    expect(textsOf(scan, findRows(treeOf(scan), "n1", rowShape, nestedPrint))).toEqual(titles.slice(0, 3));
  });
});
