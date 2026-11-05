// A plan can only name what the scan saw: the items in view, up to its node cap. A style change on
// a repeated list is still meant for the whole list, so grid and compact also reach the named
// items' like siblings, and the like lists next to theirs (a webmail's sections, a table cut into
// chunks). Hide, fold and order never come here: they act only on what the plan names.

import type { ItemShape } from "../../shared/item-shape";
import { mergeShapes } from "../../shared/item-shape";

// Named elements must be at least this many to count as a list; one element shows no repetition.
const MIN_NAMED = 2;
// How far above a named element its list item may be (a nav's links, named inside their li).
const ITEM_LEVELS = 3;
// A like item of a kind nobody named yet (a row with extra cells, another tag) shares a class and is about as tall
// as the named ones. Below or above this factor it is something else: a banner, a section title.
const SIMILAR_HEIGHT = 2;
// How far above a list to look for like lists: tbody, table, and a webmail's few wrappers per section.
const PEER_LEVELS = 6;

// Never widened into: prompts and dialogs, and what the user is typing in.
const OFF_LIMITS = "dialog, [role='dialog'], [role='alertdialog'], [aria-modal='true'], [contenteditable=''], [contenteditable='true']";
// Told apart by name: consent and sign-in prompts, and ads in a list of mail.
const NOT_FOR_US = /cookie|consent|gdpr|onetrust|sign-?in|log-?in|sponsor|promo|advert|(^|[\s_-])ads?($|[\s_-])/i;
// A page's video, or a field being filled in. A row's own checkbox is not a form being filled in.
const HOLDS_OFF_LIMITS =
  "video, textarea, select, [contenteditable=''], [contenteditable='true'], input:not([type='checkbox'], [type='radio'], [type='hidden'], [type='button'], [type='submit'], [type='reset'], [type='image'])";

export type LikeList = {
  // The lists holding named items.
  parents: Array<Element>;
  shape: ItemShape;
  // How tall the named items are on this page.
  heights?: { min: number; max: number };
  // From a list item down to what was named, when that is inside the item.
  inner?: string;
  // Named by other groups, or their regions: those groups decide about these, not this one.
  reserved: Set<Element>;
};

const childTags = (element: Element) => [...element.children].map((child) => child.tagName).toSorted();

function shapeOf(items: Array<Element>): ItemShape {
  const lists = items.map((item) => [...item.classList]);
  const kinds = new Map(items.map((item) => [childTags(item).join(" "), childTags(item)]));
  return {
    tags: [...new Set(items.map((item) => item.tagName))],
    roles: [...new Set(items.map((item) => item.getAttribute("role")))],
    classes: lists[0].filter((name) => lists.every((list) => list.includes(name))),
    classless: lists.every((list) => list.length === 0),
    kids: [...kinds.values()],
  };
}

// At least two thirds of the children's tags in common: an optional image doesn't make another kind
// of card, while a header's th cells or a footer's single wide cell do make another kind of row.
function sameKids(a: Array<string>, b: Array<string>): boolean {
  const rest = [...b];
  let common = 0;
  for (const tag of a) {
    const at = rest.indexOf(tag);
    if (at !== -1) {
      rest.splice(at, 1);
      common += 1;
    }
  }
  return common * 3 >= Math.max(a.length, b.length) * 2;
}

function heightsOf(items: Array<Element>) {
  const heights = items.map((item) => item.getBoundingClientRect().height).filter((height) => height > 0);
  return heights.length > 0 ? { min: Math.min(...heights), max: Math.max(...heights) } : undefined;
}

function isLike(element: Element, shape: ItemShape, heights?: LikeList["heights"]): boolean {
  if (!shape.roles.includes(element.getAttribute("role"))) return false;
  if (element.matches(`${OFF_LIMITS}, [data-smart-web-fold]`)) return false;
  const names = [...element.classList];
  if (shape.classes.length > 0 ? !names.some((name) => shape.classes.includes(name)) : shape.classless && names.length > 0) return false;
  // A list of promo cards is its own like items; the class that sets one row apart is what counts.
  const apart = [element.id, ...names.filter((name) => !shape.classes.includes(name))].join(" ");
  if (NOT_FOR_US.test(apart)) return false;
  if (element.querySelector(HOLDS_OFF_LIMITS)) return false;
  const tags = childTags(element);
  if (shape.tags.includes(element.tagName) && shape.kids.some((kids) => sameKids(kids, tags))) return true;
  if (shape.classes.length === 0 || !heights) return false;
  const { height } = element.getBoundingClientRect();
  return height * SIMILAR_HEIGHT >= heights.min && height <= heights.max * SIMILAR_HEIGHT;
}

// The list the named elements are items of, or undefined when they don't form one. The lists they
// sit in are always inside the plan's container. With a shape remembered from an earlier page, one
// named element is enough: what it is an item of is already known.
export function listOf(members: Array<Element>, container: Element, reserved: Set<Element>, remembered?: ItemShape): LikeList | undefined {
  if (members.length < (remembered ? 1 : MIN_NAMED)) return undefined;
  let items = members;
  const below: Array<string> = [];
  for (let level = 0; level <= ITEM_LEVELS; level++) {
    if (new Set(items).size !== items.length) return undefined;
    const parents = items.map((item) => item.parentElement);
    if (parents.some((parent) => !parent || !container.contains(parent) || parent.closest(OFF_LIMITS))) return undefined;
    const lists = new Set(parents as Array<Element>);
    const known = remembered?.tags.includes(items[0].tagName) ? remembered : undefined;
    const among = known && [...(parents[0] as Element).children].filter((child) => isLike(child, known));
    if (lists.size < items.length || (among && among.length >= MIN_NAMED)) {
      const seen = shapeOf(items);
      return {
        parents: [...lists],
        shape: known ? mergeShapes(known, seen) : seen,
        heights: heightsOf(items),
        inner: below.length > 0 ? below.join(" > ") : undefined,
        reserved,
      };
    }
    // Above the items, the path back down has to be one path.
    if (items.some((item) => item.tagName !== items[0].tagName)) return undefined;
    below.unshift(CSS.escape(items[0].tagName.toLowerCase()));
    items = parents as Array<Element>;
  }
  return undefined;
}

export const isLikeItem = (element: Element, list: LikeList) => !list.reserved.has(element) && isLike(element, list.shape, list.heights);

const sameKindOfBox = (a: Element, b: Element) => {
  if (a.tagName !== b.tagName) return false;
  const names = [...a.classList];
  return names.length === 0 ? b.classList.length === 0 : names.some((name) => b.classList.contains(name));
};

// Lists like this one nearby: a sibling, or the same element inside a sibling of a wrapper around
// it (a table beside this table, a section beside this section). Read again as the site adds more.
export function peersOf(parent: Element, list: LikeList): Array<Element> {
  const peers: Array<Element> = [];
  const below: Array<string> = [];
  let box = parent;
  for (let level = 0; level <= PEER_LEVELS; level++) {
    const outer = box.parentElement;
    if (!outer || outer === document.documentElement) break;
    for (const sibling of outer.children) {
      if (sibling === box || !sameKindOfBox(box, sibling)) continue;
      peers.push(...(below.length > 0 ? sibling.querySelectorAll(`:scope > ${below.join(" > ")}`) : [sibling]));
    }
    below.unshift(CSS.escape(box.tagName.toLowerCase()));
    box = outer;
  }
  return peers.filter(
    (peer) => !peer.closest(OFF_LIMITS) && ![...list.reserved].some((taken) => peer.contains(taken)) && [...peer.children].some((child) => isLikeItem(child, list))
  );
}
