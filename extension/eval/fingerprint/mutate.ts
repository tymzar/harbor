import type { PageScan, ScanNode } from "../../src/shared/types";

// Scan-level page changes with ground truth. A scan is rebuilt as a tree, changed the way a site
// change would show up in the next scan, and flattened again with fresh IDs (n1, n2, … in
// document order, as scanPage numbers them). Every surviving node remembers which saved node it
// was (origin); cloned rows remember the row they copy (cloneOf).

// sameAs: an inserted wrapper with the same box and content as the node it wraps; selecting it
// selects the same thing on screen.
export type TNode = { node: ScanNode; origin?: string; cloneOf?: string; sameAs?: string; kids: Array<TNode> };
export type Mutated = {
  scan: PageScan;
  newId: Map<string, string>;
  clones: Map<string, Array<string>>;
  sameAs: Map<string, string>;
  removed: Set<string>;
};

export type Rng = () => number;
export function rng(seed: number): Rng {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}
const pick = <T>(random: Rng, list: Array<T>): T => list[Math.floor(random() * list.length)];

export function toTree(scan: PageScan): Array<TNode> {
  const byId = new Map<string, TNode>();
  const roots: Array<TNode> = [];
  for (const node of scan.nodes) {
    const entry: TNode = { node: { ...node, rect: { ...node.rect }, attrs: node.attrs && { ...node.attrs } }, origin: node.id, kids: [] };
    byId.set(node.id, entry);
    const parent = node.parent ? byId.get(node.parent) : undefined;
    if (parent) parent.kids.push(entry);
    else roots.push(entry);
  }
  return roots;
}

export function flatten(roots: Array<TNode>, base: PageScan): Mutated {
  const nodes: Array<ScanNode> = [];
  const newId = new Map<string, string>();
  const clones = new Map<string, Array<string>>();
  const sameAs = new Map<string, string>();
  const walk = (entry: TNode, parent: string | undefined, depth: number) => {
    const id = `n${nodes.length + 1}`;
    nodes.push({ ...entry.node, id, parent, depth });
    if (entry.origin) newId.set(entry.origin, id);
    if (entry.sameAs) sameAs.set(id, entry.sameAs);
    if (entry.cloneOf) clones.set(entry.cloneOf, [...(clones.get(entry.cloneOf) ?? []), id]);
    for (const kid of entry.kids) walk(kid, id, depth + 1);
  };
  for (const root of roots) walk(root, undefined, 0);
  const removed = new Set(base.nodes.map((node) => node.id).filter((id) => !newId.has(id)));
  return { scan: { ...base, nodes }, newId, clones, sameAs, removed };
}

export function all(roots: Array<TNode>): Array<TNode> {
  const list: Array<TNode> = [];
  const walk = (entry: TNode) => {
    list.push(entry);
    for (const kid of entry.kids) walk(kid);
  };
  for (const root of roots) walk(root);
  return list;
}

function parentOf(roots: Array<TNode>, target: TNode): { list: Array<TNode>; parent?: TNode } {
  if (roots.includes(target)) return { list: roots };
  for (const entry of all(roots)) if (entry.kids.includes(target)) return { list: entry.kids, parent: entry };
  throw new Error("not in tree");
}

const find = (roots: Array<TNode>, origin: string) => all(roots).find((entry) => entry.origin === origin);

function shift(entry: TNode, dy: number) {
  for (const each of all([entry])) each.node.rect.y += dy;
}

// Everything at or below a y position moves down (an inserted block pushes content down).
function pushDown(roots: Array<TNode>, from: number, dy: number, except: TNode) {
  const skip = new Set(all([except]));
  for (const entry of all(roots)) if (!skip.has(entry) && entry.node.rect.y >= from) entry.node.rect.y += dy;
}

const fresh = (node: Partial<ScanNode> & Pick<ScanNode, "tag" | "kind" | "rect">): ScanNode => ({
  id: "",
  parent: undefined,
  depth: 0,
  role: undefined,
  text: "",
  sensitive: false,
  ...node,
});

const token = (random: Rng) => Math.floor(random() * 36 ** 6).toString(36);

// Deterministic pseudo-translation: every word becomes another word, consistently across the page.
const WORDS = ["lorem", "ipsum", "dolor", "amet", "velit", "nostra", "porta", "magna", "turpis", "lectus", "fusce", "urna"];
function translate(text: string): string {
  return text.replaceAll(/\p{L}{2,}/gu, (word) => {
    let value = 7;
    for (const char of word.toLowerCase()) value = (value * 31 + (char.codePointAt(0) ?? 0)) % 9973;
    return `${WORDS[value % WORDS.length]}${value % 7}`;
  });
}

export type Target = { container: string; members: Array<string>; rows: boolean };

export type Mutation = (roots: Array<TNode>, random: Rng, targets: Array<Target>) => Array<TNode>;

// Regions the change is aimed at: the saved groups' containers plus as many random list-like nodes.
function aimed(roots: Array<TNode>, random: Rng, targets: Array<Target>, count: number): Array<TNode> {
  const chosen = targets.flatMap((target) => find(roots, target.container) ?? []).filter(() => random() < 0.6);
  const lists = all(roots).filter((entry) => entry.kids.length >= 2 && entry.node.depth > 0);
  while (chosen.length < count && lists.length > 0) chosen.push(pick(random, lists));
  return [...new Set(chosen)];
}

export const MUTATIONS: Record<string, Mutation> = {
  none: (roots) => roots,

  // Classes are not in the scan; a CSS-module/CSS-in-JS rebuild shows up as regenerated
  // data-* values on styled components (data-v-xxxx, data-emotion, data-styled ids).
  "class-hash": (roots, random) => {
    for (const entry of all(roots)) {
      const attrs = entry.node.attrs;
      if (!attrs) continue;
      for (const name of Object.keys(attrs)) if (name.startsWith("data-") && random() < 0.5) attrs[name] = `css-${token(random)}`;
      if (random() < 0.2) attrs[`data-v-${token(random)}`] = "";
    }
    return roots;
  },

  // Generated ids (React useId, Ember, Angular) change on every build.
  "id-churn": (roots, random) => {
    for (const entry of all(roots)) {
      const attrs = entry.node.attrs;
      if (!attrs) continue;
      if (attrs.id) attrs.id = `:r${token(random)}:`;
      for (const name of Object.keys(attrs)) if (name.startsWith("data-") && /\d/.test(attrs[name])) attrs[name] = token(random);
    }
    return roots;
  },

  // An extra element: around a region (with a badge beside it, or it wouldn't be scanned), or
  // between a list and its rows.
  wrapper: (roots, random, targets) => {
    for (const entry of aimed(roots, random, targets, 3)) {
      const rect = { ...entry.node.rect };
      if (entry.kids.length >= 2 && random() < 0.5) {
        const inner: TNode = { node: fresh({ tag: "div", kind: "group", rect, text: entry.node.text }), sameAs: entry.origin, kids: entry.kids };
        entry.kids = [inner];
      } else {
        const { list } = parentOf(roots, entry);
        const badge: TNode = { node: fresh({ tag: "span", kind: "group", rect: { x: rect.x + rect.w - 60, y: rect.y, w: 60, h: 20 }, text: "New" }), kids: [] };
        const outer: TNode = { node: fresh({ tag: "div", kind: "group", rect, text: entry.node.text }), sameAs: entry.origin, kids: [entry, badge] };
        list.splice(list.indexOf(entry), 1, outer);
      }
    }
    return roots;
  },

  // An ad or promo block inserted before a region, pushing what follows down.
  insert: (roots, random, targets) => {
    for (const entry of aimed(roots, random, targets, 2).slice(0, 3)) {
      const { list } = parentOf(roots, entry);
      const { x, y, w } = entry.node.rect;
      const height = 90;
      const ad: TNode = {
        node: fresh({ tag: "div", kind: "group", rect: { x, y, w, h: height }, text: "Sponsored Advertisement Shop now" }),
        kids: [
          { node: fresh({ tag: "span", kind: "group", rect: { x, y, w: 120, h: 20 }, text: "Sponsored" }), kids: [] },
          { node: fresh({ tag: "a", kind: "interactive", rect: { x, y: y + 24, w: 200, h: 40 }, text: "Shop now", href: "ads.example/click" }), kids: [] },
          { node: fresh({ tag: "img", kind: "media", rect: { x: x + w - 120, y, w: 120, h: height }, text: "" }), kids: [] },
        ],
      };
      pushDown(roots, y, height, ad);
      list.splice(list.indexOf(entry), 0, ad);
    }
    return roots;
  },

  // Two stacked sections swap places.
  reorder: (roots, random, targets) => {
    for (const entry of aimed(roots, random, targets, 1).slice(0, 2)) {
      // The nearest ancestor level with a vertically stacked sibling to swap with.
      for (let current: TNode | undefined = entry; current; current = parentOf(roots, current).parent) {
        const { list } = parentOf(roots, current);
        const own = current;
        const others = list.filter((other) => other !== own && Math.abs(other.node.rect.y - own.node.rect.y) > 20 && other.node.rect.h > 20);
        if (others.length === 0) continue;
        const other = pick(random, others);
        const [top, bottom] = own.node.rect.y < other.node.rect.y ? [own, other] : [other, own];
        const gap = bottom.node.rect.y - top.node.rect.y;
        shift(bottom, -gap);
        shift(top, bottom.node.rect.h + (gap - top.node.rect.h));
        const a = list.indexOf(own);
        const b = list.indexOf(other);
        [list[a], list[b]] = [list[b], list[a]];
        break;
      }
    }
    return roots;
  },

  "text-counters": (roots, random) => {
    for (const entry of all(roots)) entry.node.text = entry.node.text.replaceAll(/\d+/g, () => String(Math.floor(random() * 5000)));
    return roots;
  },

  // Copy edits: a third of the innermost texts and labels get a word changed. Scanned text is the
  // start of everything inside an element, so the edit shows in its ancestors' text too.
  "text-copy": (roots, random) => {
    const parents = new Map<TNode, TNode | undefined>();
    for (const entry of all(roots)) for (const kid of entry.kids) parents.set(kid, entry);
    for (const entry of all(roots)) {
      if (entry.kids.length > 0 || random() > 0.33) continue;
      const before = entry.node.text;
      const after = before.replace(/\p{L}{3,}/u, (word) => `${word}s now`);
      entry.node.text = after;
      if (entry.node.attrs?.["aria-label"]) entry.node.attrs["aria-label"] = `${entry.node.attrs["aria-label"]} menu`;
      if (!before || before === after) continue;
      for (let up = parents.get(entry); up; up = parents.get(up)) up.node.text = up.node.text.replace(before, after).slice(0, 80);
    }
    return roots;
  },

  // The whole page in another language: texts and aria-labels; links and data-* stay.
  "text-translate": (roots) => {
    for (const entry of all(roots)) {
      entry.node.text = translate(entry.node.text);
      if (entry.node.attrs?.["aria-label"]) entry.node.attrs["aria-label"] = translate(entry.node.attrs["aria-label"]);
    }
    return roots;
  },

  // 1280 → 1024 px: horizontal positions and widths shrink, text wraps so heights and positions grow.
  viewport: (roots) => {
    for (const entry of all(roots)) {
      const rect = entry.node.rect;
      rect.x = Math.round(rect.x * 0.8);
      rect.w = Math.round(rect.w * 0.8);
      rect.y = Math.round(rect.y * 1.15);
      rect.h = Math.round(rect.h * (entry.node.kind === "group" || entry.node.kind === "item" ? 1.2 : 1));
    }
    return roots;
  },

  // Lists gain rows (copies with new text and links) or lose some.
  "list-grow": (roots, random, targets) => {
    for (const entry of aimed(roots, random, targets, 3)) {
      const rows = entry.kids.filter((kid) => kid.node.tag === entry.kids[0]?.node.tag && kid.node.kind === entry.kids[0]?.node.kind);
      if (rows.length < 2) continue;
      const last = rows.at(-1)!;
      const step = Math.max(10, last.node.rect.y - rows.at(-2)!.node.rect.y);
      const count = 1 + Math.floor(random() * 3);
      for (let index = 0; index < count; index += 1)
        entry.kids.splice(entry.kids.indexOf(last) + 1 + index, 0, cloneTree(last, random, step * (index + 1)));
    }
    return roots;
  },

  "list-shrink": (roots, random, targets) => {
    for (const entry of aimed(roots, random, targets, 3)) {
      const rows = entry.kids.filter((kid) => kid.node.tag === entry.kids[0]?.node.tag && kid.node.kind === entry.kids[0]?.node.kind);
      if (rows.length < 3) continue;
      for (const row of rows.slice(1).filter(() => random() < 0.4).slice(0, rows.length - 2)) entry.kids.splice(entry.kids.indexOf(row), 1);
    }
    return roots;
  },

  // One saved region redesigned: same place, different structure and content. It should be
  // reported lost, never matched to something else.
  redesign: (roots, random, targets) => {
    const target = targets.length > 0 ? find(roots, pick(random, targets).container) : undefined;
    if (!target) return roots;
    const { list } = parentOf(roots, target);
    const { x, y, w, h } = target.node.rect;
    const links = 2 + Math.floor(random() * 4);
    const fresh_: TNode = {
      node: fresh({ tag: "div", kind: "group", rect: { x, y, w, h }, text: "Discover more Picks for you" }),
      kids: [
        { node: fresh({ tag: "h3", kind: "heading", rect: { x, y, w, h: 24 }, text: "Picks for you" }), kids: [] },
        {
          node: fresh({ tag: "div", kind: "group", rect: { x, y: y + 30, w, h: Math.max(30, h - 30) }, text: "Discover more" }),
          kids: Array.from({ length: links }, (_, index) => ({
            node: fresh({ tag: "a", kind: "interactive" as const, rect: { x: x + index * 100, y: y + 30, w: 90, h: 30 }, text: `Pick ${token(random)}`, href: `/picks/${token(random)}` }),
            kids: [],
          })),
        },
      ],
    };
    list.splice(list.indexOf(target), 1, fresh_);
    return roots;
  },
};

function cloneTree(entry: TNode, random: Rng, dy: number): TNode {
  return {
    node: {
      ...entry.node,
      rect: { ...entry.node.rect, y: entry.node.rect.y + dy },
      text: entry.node.text.replaceAll(/\p{L}{4,}/gu, () => `item${token(random)}`),
      href: entry.node.href && `${entry.node.href}-${token(random)}`,
      attrs: entry.node.attrs && Object.fromEntries(Object.entries(entry.node.attrs).map(([name, value]) => [name, `${value}-${token(random)}`])),
    },
    cloneOf: entry.origin,
    kids: entry.kids.map((kid) => cloneTree(kid, random, dy)),
  };
}

// A redesign or A/B test changes several things at once.
MUTATIONS["ab-variant"] = (roots, random, targets) =>
  ["wrapper", "insert", "text-copy", "id-churn"].reduce((tree, name) => MUTATIONS[name](tree, random, targets), roots);
