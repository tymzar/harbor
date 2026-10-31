import type { NodeKind, PageScan, ScanNode } from "./types";

// Region fingerprints: a saved group is found again by what its region looks like (subtree shape,
// row shape, place among the page's landmarks and headings, coarse geometry), not only by the
// exact attributes and text of one element. See docs/fingerprint/region-level.md.

// [x, y, w, h] in viewport widths, so a narrower window keeps proportions.
export type Box = [number, number, number, number];

// What doesn't tell a node apart, decided when saving: text it shared with its parent or first
// child (plain), and attributes, link or text it shared with a sibling of its kind (common).
export type Distinct = { plain?: true; common?: Array<string> };

export type MemberPrint = Distinct & {
  shape: Array<string>;
  // Child indices from the container down to the member.
  at: Array<number>;
  // Position inside the container, in container widths/heights.
  box: Box;
  // Items of its tag and kind under its parent, itself included.
  siblings?: number;
};

export type RegionPrint = Distinct & {
  // Hashed tag.kind and parent>child tokens of the subtree: structure without text or classes.
  shape: Array<string>;
  // The same for the rows, when the group is a whole list.
  row?: Array<string>;
  // Skeleton index of the nearest landmark around the region, and of the last landmark or heading before it.
  within?: number;
  after?: number;
  // Digit-free words of the container, and hashed links and attributes inside it.
  words: Array<string>;
  marks: Array<string>;
  box: Box;
  // Groups matched item by item: one print per member, by saved ID.
  members?: Record<string, MemberPrint>;
};

// Page-level fingerprint: the landmark/heading skeleton in document order and its hash, and a hash
// of the page's distinct parent>child shapes (list lengths and text don't change it; a wrapper,
// an inserted block or a restyled region does).
export type PagePrint = { skeleton: Array<string>; hash: string; structure?: string };

const SHAPE_DEPTH = 3;
const SHAPE_CAP = 64;
const MARKS_CAP = 24;
const WORDS_CAP = 12;

export const stableText = (text: string) => text.replaceAll(/\d+/g, "").replaceAll(/\s+/g, " ").trim();

// FNV-1a, base 36: tokens are stored, so they are kept short.
export function hash(text: string): string {
  let value = 0x81_1C_9D_C5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.codePointAt(index) ?? 0;
    value = Math.imul(value, 0x01_00_01_93);
  }
  return (value >>> 0).toString(36);
}

export function dice(a: ReadonlyArray<string>, b: ReadonlyArray<string>): number {
  if (a.length === 0 && b.length === 0) return 1;
  const set = new Set(a);
  let shared = 0;
  for (const token of new Set(b)) if (set.has(token)) shared += 1;
  return (2 * shared) / (set.size + new Set(b).size);
}

// One scan indexed as a tree, with per-node fingerprints computed on demand.
export type Tree = {
  scan: PageScan;
  byId: Map<string, ScanNode>;
  children: Map<string, Array<ScanNode>>;
  order: Map<string, number>;
  anchors: Array<ScanNode>;
  shapes: Map<string, Array<string>>;
  marks: Map<string, Array<string>>;
  places: Map<string, { within?: ScanNode; after?: ScanNode }>;
};

const isAnchor = (node: ScanNode) => node.kind === "landmark" || node.kind === "heading";

export function treeOf(scan: PageScan): Tree {
  const children = new Map<string, Array<ScanNode>>();
  for (const node of scan.nodes) {
    const key = node.parent ?? "";
    const list = children.get(key);
    if (list) list.push(node);
    else children.set(key, [node]);
  }
  return {
    scan,
    byId: new Map(scan.nodes.map((node) => [node.id, node])),
    children,
    order: new Map(scan.nodes.map((node, index) => [node.id, index])),
    anchors: scan.nodes.filter((node) => isAnchor(node)),
    shapes: new Map(),
    marks: new Map(),
    places: new Map(),
  };
}

const kids = (tree: Tree, id: string) => tree.children.get(id) ?? [];
const token = (node: ScanNode) => `${node.tag}.${node.kind}`;

// Landmarks are known by tag, role and label (their text is all their content); headings by their text.
export function anchorKey(node: ScanNode): string {
  const label = node.kind === "heading" ? stableText(node.text).slice(0, 40) : (node.attrs?.["aria-label"] ?? "");
  return `${node.tag}|${node.role ?? ""}|${label.toLowerCase()}`;
}
const anchorType = (key: string) => key.slice(0, key.lastIndexOf("|"));

// Breadth first, so a capped shape keeps the levels closest to the region.
export function shapeOf(tree: Tree, id: string): Array<string> {
  const cached = tree.shapes.get(id);
  if (cached) return cached;
  const root = tree.byId.get(id);
  const tokens = new Set<string>();
  if (root) {
    tokens.add(token(root));
    let level = [root];
    for (let depth = 0; depth < SHAPE_DEPTH && level.length > 0 && tokens.size < SHAPE_CAP; depth += 1) {
      const next: Array<ScanNode> = [];
      for (const node of level)
        for (const child of kids(tree, node.id)) {
          tokens.add(token(child));
          tokens.add(`${token(node)}>${token(child)}`);
          next.push(child);
        }
      level = next;
    }
  }
  const shape = [...tokens].slice(0, SHAPE_CAP).map((value) => hash(value));
  tree.shapes.set(id, shape);
  return shape;
}

function descendants(tree: Tree, id: string, limit = Infinity): Array<ScanNode> {
  const found: Array<ScanNode> = [];
  const stack = [...kids(tree, id)];
  while (stack.length > 0 && found.length < limit) {
    const node = stack.shift()!;
    found.push(node);
    stack.push(...kids(tree, node.id));
  }
  return found;
}

function marksOf(tree: Tree, id: string): Array<string> {
  const cached = tree.marks.get(id);
  if (cached) return cached;
  const marks = new Set<string>();
  for (const node of [tree.byId.get(id)!, ...descendants(tree, id, 200)]) {
    if (node.href) marks.add(hash(`href=${node.href}`));
    for (const [name, value] of Object.entries(node.attrs ?? {})) if (name !== "aria-label") marks.add(hash(`${name}=${value}`));
    if (marks.size >= MARKS_CAP) break;
  }
  const result = [...marks].slice(0, MARKS_CAP);
  tree.marks.set(id, result);
  return result;
}

const wordsOf = (text: string) =>
  [...new Set(stableText(text).toLowerCase().split(/[^\p{L}]+/u))].filter((word) => word.length > 2).slice(0, WORDS_CAP);

const round = (value: number) => Math.round(value * 1000) / 1000;

function boxOf(tree: Tree, node: ScanNode): Box {
  const width = tree.scan.viewport.w || 1;
  const { x, y, w, h } = node.rect;
  return [round(x / width), round(y / width), round(w / width), round(h / width)];
}

function isInside(tree: Tree, id: string, ancestor: string): boolean {
  for (let current = tree.byId.get(id)?.parent; current; current = tree.byId.get(current)?.parent)
    if (current === ancestor) return true;
  return false;
}

// The nearest landmark around a node, and the last anchor before it that doesn't contain it.
function contextOf(tree: Tree, node: ScanNode): { within?: ScanNode; after?: ScanNode } {
  const cached = tree.places.get(node.id);
  if (cached) return cached;
  let within: ScanNode | undefined;
  for (let current = node.parent; current && !within; current = tree.byId.get(current)?.parent) {
    const candidate = tree.byId.get(current);
    if (candidate?.kind === "landmark") within = candidate;
  }
  const position = tree.order.get(node.id) ?? 0;
  let after: ScanNode | undefined;
  for (let index = tree.anchors.length - 1; index >= 0; index -= 1) {
    const anchor = tree.anchors[index];
    if ((tree.order.get(anchor.id) ?? 0) >= position || isInside(tree, node.id, anchor.id)) continue;
    after = anchor;
    break;
  }
  tree.places.set(node.id, { within, after });
  return { within, after };
}

export function pagePrint(scan: PageScan): PagePrint {
  const skeleton = scan.nodes.filter((node) => isAnchor(node)).map((node) => anchorKey(node));
  const byId = new Map(scan.nodes.map((node) => [node.id, node]));
  const edges = new Set<string>();
  for (const node of scan.nodes) {
    const parent = node.parent ? byId.get(node.parent) : undefined;
    edges.add(`${parent ? token(parent) : ""}>${token(node)}`);
  }
  return { skeleton, hash: hash(skeleton.join("\n")), structure: hash([...edges].toSorted().join("\n")) };
}

// Which part of the page changed since a plan was saved; either one means its groups are re-verified.
export function pageChanged(saved: PagePrint | undefined, now: PagePrint): { skeleton: boolean; structure: boolean } {
  return { skeleton: saved?.hash !== now.hash, structure: saved?.structure !== now.structure };
}

// The path of child indices from an ancestor down to a node.
function pathFrom(tree: Tree, ancestor: string, id: string): Array<number> {
  const path: Array<number> = [];
  for (let current = tree.byId.get(id); current && current.id !== ancestor; current = tree.byId.get(current.parent ?? "")) {
    path.unshift(kids(tree, current.parent ?? "").indexOf(current));
    if (!current.parent) break;
  }
  return path;
}

function relativeBox(container: ScanNode, node: ScanNode): Box {
  const { x, y, w, h } = container.rect;
  const width = w || 1;
  const height = h || 1;
  return [round((node.rect.x - x) / width), round((node.rect.y - y) / height), round(node.rect.w / width), round(node.rect.h / height)];
}

export function regionPrint(tree: Tree, containerId: string, members: Array<string>, rows: boolean): RegionPrint | undefined {
  const container = tree.byId.get(containerId);
  if (!container) return undefined;
  const skeletonIndex = new Map(tree.anchors.map((anchor, index) => [anchor.id, index]));
  const { within, after } = contextOf(tree, container);
  const print: RegionPrint = {
    shape: shapeOf(tree, containerId),
    within: within && skeletonIndex.get(within.id),
    after: after && skeletonIndex.get(after.id),
    words: wordsOf(container.text),
    marks: marksOf(tree, containerId),
    box: boxOf(tree, container),
    ...distinctOf(tree, container),
  };
  if (rows) print.row = [...new Set(members.slice(0, 5).flatMap((id) => shapeOf(tree, id)))].slice(0, SHAPE_CAP);
  else {
    print.members = {};
    for (const id of members) {
      const node = tree.byId.get(id);
      if (!node) continue;
      print.members[id] = {
        shape: shapeOf(tree, id),
        at: pathFrom(tree, containerId, id),
        box: relativeBox(container, node),
        siblings: siblingsOf(tree, node),
        ...distinctOf(tree, node),
      };
    }
  }
  return print;
}

// Scanned text is the first 80 characters of everything inside, so a wrapper and its first child
// often read the same; such text says nothing about which of the two was meant. Values a sibling
// of the same kind also has (a styling data-* attribute, "Reply") don't single it out either.
function distinctOf(tree: Tree, node: ScanNode): Distinct {
  const parent = node.parent ? tree.byId.get(node.parent) : undefined;
  const first = kids(tree, node.id)[0];
  const text = stableText(node.text);
  const siblings = kids(tree, node.parent ?? "").filter((other) => other !== node && other.tag === node.tag && other.kind === node.kind);
  const common = [
    ...Object.entries(node.attrs ?? {}).flatMap(([name, value]) => (siblings.some((other) => other.attrs?.[name] === value) ? [name] : [])),
    ...(node.href && siblings.some((other) => other.href === node.href) ? ["href"] : []),
    ...(text && siblings.some((other) => stableText(other.text) === text) ? ["text"] : []),
  ];
  const distinct: Distinct = {};
  if (node.text && (parent?.text === node.text || first?.text === node.text)) distinct.plain = true;
  if (common.length > 0) distinct.common = common;
  return distinct;
}

// The identity to match on: without what didn't tell the node apart when it was saved.
export function distinctIdentity<T extends Identity>(saved: T, print: Distinct | undefined): T {
  if (!print?.plain && !print?.common) return saved;
  const common = new Set(print.common);
  return {
    ...saved,
    attrs: saved.attrs && Object.fromEntries(Object.entries(saved.attrs).filter(([name]) => !common.has(name))),
    href: common.has("href") ? undefined : saved.href,
    text: print.plain || common.has("text") ? "" : saved.text,
  };
}

// Does the region still carry the links/attributes (or, without those, the words) it had? Then
// its items are still identifiable, and a member that can't be identified is gone rather than moved.
export function regionHolds(tree: Tree, print: RegionPrint, container: string): { marks: boolean; words: boolean } {
  const node = tree.byId.get(container);
  return {
    marks: print.marks.length > 0 && dice(print.marks, marksOf(tree, container)) >= HOLD,
    words: print.words.length > 0 && node !== undefined && dice(print.words, wordsOf(node.text)) >= HOLD,
  };
}
const HOLD = 0.3;

// Anchors of the saved skeleton found in the new scan: exact keys first (longest common
// subsequence), then the anchors left between two matched ones are paired in order by tag and
// role, which keeps translated or reworded headings.
export function alignSkeleton(saved: Array<string>, tree: Tree): Map<number, string> {
  const next = tree.anchors.map((node) => anchorKey(node));
  const rows = saved.length;
  const cols = next.length;
  // table[old][now]: length of the longest common subsequence of saved[old..] and next[now..].
  const table = Array.from({ length: rows + 1 }, () => new Uint16Array(cols + 1));
  for (let old = rows - 1; old >= 0; old -= 1)
    for (let now = cols - 1; now >= 0; now -= 1)
      table[old][now] = saved[old] === next[now] ? table[old + 1][now + 1] + 1 : Math.max(table[old + 1][now], table[old][now + 1]);
  const pairs: Array<[number, number]> = [];
  for (let old = 0, now = 0; old < rows && now < cols; ) {
    if (saved[old] === next[now]) {
      pairs.push([old, now]);
      old += 1;
      now += 1;
    } else if (table[old + 1][now] >= table[old][now + 1]) old += 1;
    else now += 1;
  }
  const mapped = new Map<number, string>();
  let lastOld = -1;
  let lastNow = -1;
  for (const [old, now] of [...pairs, [rows, cols] as [number, number]]) {
    // Gap between two exact matches: pair same-type anchors in order.
    let cursor = lastNow + 1;
    for (let gapOld = lastOld + 1; gapOld < old; gapOld += 1)
      for (let gapNow = cursor; gapNow < now; gapNow += 1)
        if (anchorType(saved[gapOld]) === anchorType(next[gapNow])) {
          mapped.set(gapOld, tree.anchors[gapNow].id);
          cursor = gapNow + 1;
          break;
        }
    if (old < rows) mapped.set(old, tree.anchors[now].id);
    lastOld = old;
    lastNow = now;
  }
  return mapped;
}

// Content identity, as the element-level locator scores it, in 0..1; undefined when the saved node had none.
export type Identity = { tag: string; kind: NodeKind; attrs?: Record<string, string>; href?: string; text: string };

export function identityOf(saved: Identity, node: ScanNode): number | undefined {
  let total = 0;
  let count = 0;
  for (const [name, value] of Object.entries(saved.attrs ?? {})) {
    count += 1;
    if (node.attrs?.[name] === value) total += 1;
  }
  if (saved.href) {
    count += 1;
    if (saved.href === node.href) total += 1;
  }
  if (saved.text) {
    count += 1;
    if (saved.text === stableText(node.text)) total += 1;
  }
  return count > 0 ? total / count : undefined;
}

const sameType = (saved: Identity, node: ScanNode) => (saved.tag === node.tag ? 1 : (saved.kind === node.kind ? 0.5 : 0));

// Distance in viewport widths; horizontal position and width count double (they hold under
// insertions above), vertical position half.
function geometry(a: Box, b: Box): number {
  const distance = Math.abs(a[0] - b[0]) + Math.abs(a[2] - b[2]) + 0.5 * (Math.abs(a[1] - b[1]) + Math.abs(a[3] - b[3]));
  return Math.max(0, 1 - distance / 0.5);
}

function weighted(parts: Array<[number | undefined, number]>): number {
  let sum = 0;
  let weights = 0;
  for (const [value, weight] of parts) {
    if (value === undefined) continue;
    sum += value * weight;
    weights += weight;
  }
  return weights > 0 ? sum / weights : 0;
}

export type RegionMatch = { id: string; score: number; confidence: number; geometry: number };

// textGone: almost no heading or landmark label reads as it did (another language): words and
// text stop counting, for and against, and regions are found by structure, place and links.
type Context = { tree: Tree; anchors: Map<number, string>; textGone: boolean };

// An identity without anything written in the page's language: text and aria-label.
export function wordless<T extends Identity>(saved: T): T {
  const unlabelled = saved.attrs && Object.fromEntries(Object.entries(saved.attrs).filter(([name]) => name !== "aria-label"));
  return { ...saved, text: "", attrs: unlabelled };
}

export function contextFor(tree: Tree, skeleton: Array<string>): Context {
  const labelled = skeleton.filter((key) => !key.endsWith("|"));
  const now = new Set(tree.anchors.map((anchor) => anchorKey(anchor)));
  const kept = labelled.filter((key) => now.has(key)).length;
  return { tree, anchors: alignSkeleton(skeleton, tree), textGone: labelled.length >= 3 && kept < TEXT_GONE * labelled.length };
}
const TEXT_GONE = 0.3;

// Does the candidate sit where the saved region sat among the aligned anchors? Unknown counts half.
function placeScore(context: Context, saved: number | undefined, actual: ScanNode | undefined): number {
  if (saved === undefined) return actual ? 0.5 : 1;
  const expected = context.anchors.get(saved);
  if (!expected) return 0.5;
  return actual?.id === expected ? 1 : 0;
}

export function scoreRegion(context: Context, print: RegionPrint, saved: Identity, node: ScanNode): number {
  const { tree } = context;
  const type = sameType(saved, node);
  const shape = dice(print.shape, shapeOf(tree, node.id));
  if (type === 0 && shape < 0.5) return 0;
  const place = contextOf(tree, node);
  let row: number | undefined;
  if (print.row) {
    row = 0;
    for (const child of [...kids(tree, node.id), ...kids(tree, kids(tree, node.id)[0]?.id ?? "")])
      row = Math.max(row, dice(print.row, shapeOf(tree, child.id)));
  }
  return weighted([
    [type, 1],
    [shape, 3],
    [row, 2],
    [identityOf(context.textGone ? wordless(saved) : saved, node), 3],
    [print.marks.length > 0 ? dice(print.marks, marksOf(tree, node.id)) : undefined, 2],
    [print.words.length > 0 && !context.textGone ? dice(print.words, wordsOf(node.text)) : undefined, 1.5],
    [(placeScore(context, print.within, place.within) + placeScore(context, print.after, place.after)) / 2, 2],
    [geometry(print.box, boxOf(tree, node)), 1],
  ]);
}

// The best candidate for each saved region, one region per element, strongest first. Confidence is
// the score less a penalty when a different region (not an ancestor or descendant) scores nearly as well.
export function matchRegions(
  context: Context,
  wanted: Array<{ key: string; print: RegionPrint; saved: Identity }>
): Map<string, RegionMatch> {
  const { tree } = context;
  // Groups sharing a container (a user's hide inside a planned list) share its match.
  const unique = [...new Map(wanted.map((entry) => [entry.key, entry])).values()];
  const ranked = unique.map(({ key, print, saved }) => {
    const scores = tree.scan.nodes
      .filter((node) => !node.sensitive)
      .map((node) => ({ node, score: scoreRegion(context, print, saved, node) }))
      .filter(({ score }) => score > 0)
      .toSorted((a, b) => b.score - a.score);
    // Nothing but shape to go on (an empty box): only where it was, like the element locator.
    const blank = !hasIdentity(saved) && print.marks.length === 0 && print.words.length === 0;
    return { key, print, scores, blank };
  });
  const found = new Map<string, RegionMatch>();
  const taken = new Set<string>();
  const best = (entry: (typeof ranked)[number]) => entry.scores.find(({ node }) => !taken.has(node.id));
  for (const entry of ranked.toSorted((a, b) => (best(b)?.score ?? 0) - (best(a)?.score ?? 0))) {
    let top = best(entry);
    if (!top) continue;
    // Nested wrappers read the same (shared text, shared links); among those scoring nearly as
    // well, the one whose box is closest to the saved region's is the region.
    const first = top;
    const nested = entry.scores.filter(
      ({ node, score }) =>
        !taken.has(node.id) && first.score - score <= NESTED && (isInside(tree, node.id, first.node.id) || isInside(tree, first.node.id, node.id))
    );
    for (const candidate of nested)
      if (geometry(entry.print.box, boxOf(tree, candidate.node)) > geometry(entry.print.box, boxOf(tree, top.node))) top = candidate;
    const rival = entry.scores.find(
      ({ node }) => node.id !== top.node.id && !isInside(tree, node.id, top.node.id) && !isInside(tree, top.node.id, node.id)
    );
    const margin = top.score - (rival?.score ?? 0);
    const place = geometry(entry.print.box, boxOf(tree, top.node));
    let confidence = top.score - Math.max(0, AMBIGUITY - margin);
    if (entry.blank) confidence = Math.min(confidence, place);
    found.set(entry.key, { id: top.node.id, score: top.score, confidence, geometry: place });
    taken.add(top.node.id);
  }
  return found;
}

const AMBIGUITY = 0.1;
const NESTED = 0.05;

// Rows of a whole-list group: the container's children of the saved row shape. When the site put
// a wrapper between the container and its rows, the rows are looked for one or two levels down.
export function findRows(tree: Tree, container: string, shape: { tag: string; kind: NodeKind }, print?: Array<string>): Array<string> {
  const isRow = (node: ScanNode) =>
    node.kind === shape.kind && (node.tag === shape.tag || (print !== undefined && dice(print, shapeOf(tree, node.id)) >= 0.6));
  const direct = kids(tree, container).filter((node) => isRow(node));
  // One "row" may be the wrapper itself, when it has the rows' tag and kind.
  if (direct.length > 1) return direct.map((node) => node.id);
  const root = tree.byId.get(container);
  if (!root) return [];
  // A wrapper fills most of the region; a smaller box inside is another list (a toolbar next to it).
  const wrappers = descendants(tree, container, 60).filter(
    (node) => node.depth - root.depth <= 2 && area(node) >= WRAPPER_AREA * area(root)
  );
  // The nearest level that holds rows again (breadth first): deeper lists are other lists (cards in a grid).
  for (const parent of wrappers) {
    const rows = kids(tree, parent.id).filter((node) => isRow(node));
    if (rows.length > 1) return rows.map((node) => node.id);
  }
  return direct.map((node) => node.id);
}

const WRAPPER_AREA = 0.6;
const area = (node: ScanNode) => node.rect.w * node.rect.h;
const NO_HOLD = { marks: false, words: false };

const siblingsOf = (tree: Tree, node: ScanNode) =>
  kids(tree, node.parent ?? "").filter((other) => other.tag === node.tag && other.kind === node.kind).length;

const hasIdentity = (saved: Identity) => Object.keys(saved.attrs ?? {}).length > 0 || Boolean(saved.href) || Boolean(saved.text);

const pathScore = (a: Array<number>, b: Array<number>) =>
  a.length === b.length && a.every((value, index) => value === b[index]) ? 1 : (a.at(-1) === b.at(-1) ? 0.5 : 0);

const MEMBER_MIN = 0.55;

// Members of a group matched item by item, searched only inside the matched container. A member
// with an identity must match on it while the group's other members or the region's own links
// and words still do (tabs must not swap; a removed row must not become its neighbour).
// Positional matching takes over only when the region lost that kind of identity as a whole (a
// translated page, regenerated ids).
export function findMembers(
  tree: Tree,
  container: string,
  members: Array<{ id: string; saved: Identity; print?: MemberPrint; isContainer: boolean }>,
  requireIdentity: boolean,
  holds: { marks: boolean; words: boolean } = NO_HOLD,
  textGone = false
): Map<string, string> {
  const found = new Map<string, string>();
  const root = tree.byId.get(container);
  if (!root) return found;
  const inside = descendants(tree, container).filter((node) => !node.sensitive);
  // Text a member shares with its parent or first child only counts in its favour; it never rules a candidate out.
  const hard = (member: (typeof members)[number]) => {
    const saved = distinctIdentity(member.saved, member.print);
    return textGone ? wordless(saved) : saved;
  };
  const groupHolds =
    requireIdentity ||
    members.some((member) => inside.some((node) => sameType(member.saved, node) > 0 && (identityOf(hard(member), node) ?? 0) > 0));
  const taken = new Set<string>();
  for (const member of members) {
    if (member.isContainer) {
      found.set(member.id, container);
      continue;
    }
    const saved = hard(member);
    const marked = Object.keys(saved.attrs ?? {}).length > 0 || Boolean(saved.href);
    const mustMatch = groupHolds || (marked ? holds.marks : Boolean(saved.text) && holds.words);
    let best: { id: string; score: number } | undefined;
    for (const node of inside) {
      if (taken.has(node.id) || sameType(saved, node) === 0) continue;
      const identity = identityOf(saved, node);
      if (mustMatch && identity !== undefined && identity === 0) continue;
      const soft = !textGone && member.print?.plain && !member.print.common?.includes("text") && member.saved.text ? Number(member.saved.text === stableText(node.text)) : undefined;
      // By position only: the list must still have as many items, or a removed one would become its neighbour.
      if (!identity && !soft && member.print?.siblings !== undefined && member.print.siblings !== siblingsOf(tree, node)) continue;
      const score = weighted([
        [sameType(saved, node), 1],
        [identity, 3],
        [soft, 1.5],
        [member.print ? dice(member.print.shape, shapeOf(tree, node.id)) : undefined, 2],
        [member.print ? pathScore(member.print.at, pathFrom(tree, container, node.id)) : undefined, 1],
        [member.print ? geometry(member.print.box, relativeBox(root, node)) : undefined, 1.5],
      ]);
      if (score >= MEMBER_MIN && (!best || score > best.score)) best = { id: node.id, score };
    }
    if (best) {
      found.set(member.id, best.id);
      taken.add(best.id);
    }
  }
  return found;
}
