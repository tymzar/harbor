import type { Operation } from "../../shared/plan";
import { currentScan, nodeRegistry } from "./scan";

export type LayoutGroup = { label: string; container: string; members: Array<string>; operation: Operation };
export type LayoutResult = { applied: Array<string>; missing: Array<string>; stale?: true };

const GROUP = "data-smart-web-group";
const OP = "data-smart-web-op";
const MEMBER = "data-smart-web-member";
const PREVIEW = "data-smart-web-preview";

// Every element Smart Web marked, so restore can unmark exactly those.
const owned = new Set<Element>();
let onEscape: ((event: KeyboardEvent) => void) | undefined;

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

function mark(element: Element, name: string, value: string) {
  element.setAttribute(name, value);
  owned.add(element);
}

export function restoreLayout(): number {
  const count = owned.size;
  for (const element of owned) for (const name of [GROUP, OP, MEMBER]) element.removeAttribute(name);
  owned.clear();
  document.documentElement.removeAttribute(PREVIEW);
  if (onEscape) globalThis.removeEventListener("keydown", onEscape, true);
  onEscape = undefined;
  return count;
}

// Marks the plan's elements; the inserted stylesheet does the rest. In preview, regions are
// outlined and Escape on the page undoes everything.
export function applyLayout(groups: Array<LayoutGroup>, preview: boolean, scannedAt: number): LayoutResult {
  restoreLayout();
  const result: LayoutResult = { applied: [], missing: [] };
  // IDs from another scan would mark the wrong elements.
  if (scannedAt !== currentScan()) return { applied: [], missing: groups.map((group) => group.label), stale: true };

  for (const [index, group] of groups.entries()) {
    const container = resolve(group.container);
    const members = group.members.flatMap((id) => resolve(id) ?? []);
    // Removed by the site since the scan: report it rather than guess.
    if (!container?.isConnected || members.length === 0) {
      result.missing.push(group.label);
      continue;
    }
    const target =
      group.operation === "grid" || group.operation === "compact" ? layoutParent(container, members) : regionOf(container);
    mark(target, GROUP, String(index));
    mark(target, OP, group.operation);
    for (const member of members) mark(member, MEMBER, "");
    result.applied.push(group.label);
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
