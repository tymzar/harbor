import type { Operation } from "../../shared/plan";
import { currentScan, elementIds, nodeRegistry } from "./scan";
import { pressFeatures, startSignals, stopSignals } from "./signals";

export type LayoutGroup = { label: string; container: string; members: Array<string>; operation: Operation };
export type LayoutResult = { applied: Array<string>; missing: Array<string>; stale?: true };

const GROUP = "data-smart-web-group";
const OP = "data-smart-web-op";
const MEMBER = "data-smart-web-member";
const PREVIEW = "data-smart-web-preview";
const OPEN = "data-smart-web-open";

// Toggles Harbor added in front of folded regions; the only elements it ever inserts. Restore removes them.
const folds = new Set<HTMLButtonElement>();

// Every element Harbor marked, so restore can unmark exactly those.
const owned = new Set<Element>();
let onEscape: ((event: KeyboardEvent) => void) | undefined;
// Watches an applied layout for the site replacing the elements it marked (single-page apps
// re-render whole regions); the background then reads the page again and re-applies the plan.
let redrawWatch: MutationObserver | undefined;
// Mutations arrive in bursts while a site re-renders; report once it has settled.
const REDRAW_SETTLE_MS = 300;
// Items of a kept layout, for learning which ones the user opens: element → its group and node.
const itemOf = new Map<Element, { label: string; nodeId: string }>();
let onActivate: ((event: MouseEvent) => void) | undefined;

const resolve = (id: string) => nodeRegistry.get(id)?.deref();

// grid and compact act on a container's direct children. A plan's container is the nearest scanned
// ancestor, which may sit a few wrappers above the items; use the items' own parent when they share one.
// emphasize and hide-secondary act on the region as a whole, so they keep the planned container
// (see regionOf for tables).
function layoutParent(container: Element, members: Array<Element>): Element {
  const parent = members[0]?.parentElement;
  return parent && members.every((member) => member.parentElement === parent) && container.contains(parent)
    ? parent
    : container;
}

// Outlines and backgrounds aren't drawn on table sections and rows; a region-level change
// on one goes to its table.
function regionOf(container: Element): Element {
  return /^table-(row|row-group|header-group|footer-group)$/.test(getComputedStyle(container).display)
    ? (container.closest("table") ?? container)
    : container;
}

// Scanned in the current scan (elementIds also remembers elements from earlier scans).
const scanned = (element: Element) => {
  const id = elementIds.get(element);
  return id !== undefined && resolve(id) === element;
};

// The nearest scanned elements below this one: what the plan saw inside it.
function scannedChildren(element: Element): Array<Element> {
  return [...element.children].flatMap((child) => (scanned(child) ? [child] : scannedChildren(child)));
}

// True when the members are most of what the scan saw in this element: more than half of its
// visible scanned children are members or mostly members themselves. A heading or a toggle beside
// a hidden list doesn't keep the list's box on screen; one item out of a menu of three does.
function mostlyMembers(element: Element, members: Set<Element>): boolean {
  if (members.has(element)) return true;
  const children = scannedChildren(element).filter((child) => child.checkVisibility({ checkVisibilityCSS: true }));
  const covered = children.filter((child) => mostlyMembers(child, members)).length;
  return covered * 2 > children.length;
}

// A plan may name a wide container for one member (the whole left menu, to hide Shorts). Hiding
// the container would take the rest with it, so the region goes only when the members are most
// of it; otherwise just the members are hidden.
function hideTargets(container: Element, members: Array<Element>): Array<Element> {
  return mostlyMembers(container, new Set(members)) ? [regionOf(container)] : members;
}

// Hiding what is inside a card can leave the card's own frame on screen: an empty bordered,
// rounded box. Climb to the outermost ancestor that holds nothing else visible, a few levels at
// most and never past the page's main content, and hide that instead.
const SHELL_STOP = "body, main, [role='main']";
const SHELL_LEVELS = 4;

function showsSomething(element: Element): boolean {
  if (!element.checkVisibility({ checkVisibilityCSS: true })) return false;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

function shellOf(target: Element, hidden: Set<Element>): Element {
  let shell = target;
  for (let level = 0; level < SHELL_LEVELS; level++) {
    const parent = shell.parentElement;
    if (!parent || parent.matches(SHELL_STOP)) break;
    const text = [...parent.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    const rest = [...parent.children].some((child) => child !== shell && !hidden.has(child) && showsSomething(child));
    if (text || rest) break;
    shell = parent;
  }
  return shell;
}

// Hidden targets, widened to their empty frames. Repeated so two hidden siblings take their shared frame.
function withShells(targets: Array<Element>): Array<Element> {
  let current = targets;
  for (let pass = 0; pass < 3; pass++) {
    const hidden = new Set(current);
    const next = [...new Set(current.map((target) => shellOf(target, hidden)))];
    // An outer frame replaces the targets inside it.
    const outer = next.filter((target) => !next.some((other) => other !== target && other.contains(target)));
    if (outer.length === current.length && outer.every((target, index) => target === current[index])) break;
    current = outer;
  }
  return current;
}

function mark(element: Element, name: string, value: string) {
  element.setAttribute(name, value);
  owned.add(element);
}

export function restoreLayout(): number {
  const count = owned.size;
  for (const element of owned) for (const name of [GROUP, OP, MEMBER, OPEN]) element.removeAttribute(name);
  owned.clear();
  for (const fold of folds) fold.remove();
  folds.clear();
  document.documentElement.removeAttribute(PREVIEW);
  if (onEscape) globalThis.removeEventListener("keydown", onEscape, true);
  onEscape = undefined;
  redrawWatch?.disconnect();
  redrawWatch = undefined;
  if (onActivate) globalThis.removeEventListener("click", onActivate, true);
  onActivate = undefined;
  stopSignals();
  itemOf.clear();
  return count;
}

// The kept layout's item at or around a page element.
function itemAt(target: EventTarget | null): { element: Element; label: string; nodeId: string } | undefined {
  if (!(target instanceof Element)) return undefined;
  for (let current: Element | null = target; current; current = current.parentElement) {
    const item = itemOf.get(current);
    if (item) return { element: current, ...item };
  }
  return undefined;
}

// Reports real clicks (not scripted ones) on items of a kept layout, with how the press was made;
// the background learns from them only where the user turned learning on.
function watchActivations() {
  startSignals((target) => {
    const item = itemAt(target);
    return item && { key: item.nodeId, element: item.element };
  });
  onActivate = (event) => {
    const item = event.isTrusted ? itemAt(event.target) : undefined;
    if (!item) return;
    void chrome.runtime.sendMessage({ type: "activation", label: item.label, nodeId: item.nodeId, features: pressFeatures(event.timeStamp) });
  };
  globalThis.addEventListener("click", onActivate, true);
}

function watchForRedraw() {
  let pending: ReturnType<typeof setTimeout> | undefined;
  redrawWatch = new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = undefined;
      if (![...owned].some((element) => !element.isConnected)) return;
      // Reported once; the rescan re-injects this script and the new layout watches again.
      redrawWatch?.disconnect();
      void chrome.runtime.sendMessage({ type: "page-redrawn" });
    }, REDRAW_SETTLE_MS);
  });
  redrawWatch.observe(document.body, { childList: true, subtree: true });
}

// A one-line "Show …" toggle in front of a folded region: a real button, so keyboard and screen
// readers reach it; aria-expanded tells them whether the region is open.
function addFold(target: Element, label: string) {
  const fold = document.createElement("button");
  fold.type = "button";
  fold.dataset.smartWebFold = "";
  fold.setAttribute("aria-expanded", "false");
  fold.textContent = `Show ${label}`;
  fold.addEventListener("click", () => {
    const open = !target.hasAttribute(OPEN);
    if (open) target.setAttribute(OPEN, "");
    else target.removeAttribute(OPEN);
    fold.setAttribute("aria-expanded", String(open));
    fold.textContent = `${open ? "Hide" : "Show"} ${label}`;
  });
  target.before(fold);
  folds.add(fold);
}

// Marks the plan's elements; the inserted stylesheet does the rest. In preview, regions are
// outlined and Escape on the page undoes everything.
export function applyLayout(groups: Array<LayoutGroup>, preview: boolean, scannedAt: number): LayoutResult {
  restoreLayout();
  const result: LayoutResult = { applied: [], missing: [] };
  // IDs from another scan would mark the wrong elements.
  if (scannedAt !== currentScan()) return { applied: [], missing: groups.map((group) => group.label), stale: true };

  const planned: Array<{ index: number; group: LayoutGroup; targets: Array<Element>; found: Array<{ id: string; element: Element }> }> = [];
  for (const [index, group] of groups.entries()) {
    const container = resolve(group.container);
    const found = group.members.flatMap((id) => {
      const element = resolve(id);
      return element ? [{ id, element }] : [];
    });
    const members = found.map(({ element }) => element);
    // Left as it is: nothing is marked, its items are only watched for learning.
    if (group.operation === "none") {
      for (const { id, element } of found) itemOf.set(element, { label: group.label, nodeId: id });
      continue;
    }
    // Removed by the site since the scan: report it rather than guess.
    if (!container?.isConnected || members.length === 0) {
      result.missing.push(group.label);
      continue;
    }
    let targets = [regionOf(container)];
    if (group.operation === "grid" || group.operation === "compact") targets = [layoutParent(container, members)];
    if (group.operation === "hide-secondary" || group.operation === "collapse") targets = hideTargets(container, members);
    planned.push({ index, group, targets, found });
  }

  // Frames are worked out over every hidden region at once, before anything is marked.
  const hides = planned.filter(({ group }) => group.operation === "hide-secondary");
  const shells = new Map<Element, Element>();
  const widened = withShells(hides.flatMap(({ targets }) => targets));
  for (const target of hides.flatMap(({ targets }) => targets)) shells.set(target, widened.find((shell) => shell.contains(target)) ?? target);
  const claimed = new Set<Element>();

  for (const { index, group, targets: planTargets, found } of planned) {
    let targets = planTargets;
    if (group.operation === "hide-secondary") {
      // A frame shared by two groups is marked once, by the first.
      targets = [...new Set(targets.map((target) => shells.get(target) ?? target))].filter((target) => !claimed.has(target));
      for (const target of targets) claimed.add(target);
    }
    for (const target of targets) {
      mark(target, GROUP, String(index));
      mark(target, OP, group.operation);
      if (group.operation === "collapse") addFold(target, group.label);
    }
    for (const { id, element } of found) {
      mark(element, MEMBER, "");
      if (group.operation !== "hide-secondary" && group.operation !== "collapse") itemOf.set(element, { label: group.label, nodeId: id });
    }
    result.applied.push(group.label);
  }

  if (!preview && result.applied.length > 0) {
    watchForRedraw();
    watchActivations();
  }
  if (preview && result.applied.length > 0) {
    document.documentElement.setAttribute(PREVIEW, "");
    onEscape = (event) => {
      if (event.key !== "Escape") return;
      restoreLayout();
      void chrome.runtime.sendMessage({ type: "page-restored" });
    };
    globalThis.addEventListener("keydown", onEscape, true);
  }
  return result;
}
