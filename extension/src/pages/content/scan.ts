import type { NodeKind, PageScan, ScanNode } from "../../shared/types";

const MAX_NODES = 600;
const TEXT_LIMIT = 80;

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "LINK",
  "META",
  "HEAD",
]);
const LANDMARK_TAGS = new Set([
  "NAV",
  "HEADER",
  "FOOTER",
  "MAIN",
  "ASIDE",
  "SECTION",
  "ARTICLE",
  "FORM",
]);
const LANDMARK_ROLES = new Set([
  "navigation",
  "banner",
  "contentinfo",
  "main",
  "complementary",
  "region",
  "search",
  "form",
]);
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "tab",
  "menuitem",
  "checkbox",
  "switch",
  "option",
]);
const SENSITIVE_SELECTOR =
  "input, textarea, select, [contenteditable=''], [contenteditable='true']";

function classify(element: Element): NodeKind | undefined {
  const tag = element.tagName;
  const role = element.getAttribute("role");

  if (LANDMARK_TAGS.has(tag) || (role && LANDMARK_ROLES.has(role)))
    return "landmark";
  if (/^H[1-6]$/.test(tag) || role === "heading") return "heading";
  if (
    tag === "A" ||
    tag === "BUTTON" ||
    tag === "SUMMARY" ||
    element.matches(SENSITIVE_SELECTOR) ||
    (role && INTERACTIVE_ROLES.has(role))
  )
    return "interactive";
  if (tag === "UL" || tag === "OL" || tag === "TABLE" || role === "list")
    return "list";
  if (tag === "LI" || tag === "TR" || role === "listitem") return "item";
  if (tag === "IMG" || tag === "VIDEO" || tag === "PICTURE" || tag === "SVG")
    return "media";

  // A plain container counts as a group when it lays out two or more visible children:
  // these are the cards, rows and toolbars that unlabelled markup is made of.
  let visibleChildren = 0;
  for (const child of element.children) {
    const rect = child.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) visibleChildren += 1;
    if (visibleChildren >= 2) return "group";
  }
  return undefined;
}

// checkVisibility also looks at ancestors: a closed menu that fades out with opacity 0 on its
// outer panel (GitHub's header menus) would otherwise count as on screen.
function isRendered(element: Element, rect: DOMRect): boolean {
  if (rect.width < 1 || rect.height < 1) return false;
  return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
}

function intersectsViewport(rect: DOMRect): boolean {
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < innerHeight &&
    rect.left < innerWidth
  );
}

// Label or visible text, words kept apart. textContent glues sibling elements together
// ("DocsGuides"), so text nodes are joined instead.
export function readableText(element: Element, limit = TEXT_LIMIT): string {
  const label =
    element.getAttribute("aria-label") ??
    element.getAttribute("alt") ??
    element.getAttribute("title");
  let raw = label ?? "";
  if (!label) {
    const texts = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node && raw.length <= limit; node = texts.nextNode())
      raw += ` ${node.nodeValue}`;
  }
  const text = raw.replaceAll(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function snippet(element: Element, sensitive: boolean): string {
  return sensitive ? "" : readableText(element);
}

const ATTR_VALUE_LIMIT = 40;
const MAX_ATTRS = 4;

function linkPath(element: Element): string | undefined {
  if (!(element instanceof HTMLAnchorElement) || !element.href) return undefined;
  const url = new URL(element.href);
  // A link to a place on this page is that place ("#jobs"), not the page's own path: the same
  // bar on another page of the site then carries the same links, and its items are found again.
  if (url.origin === location.origin && url.pathname === location.pathname && url.hash) return url.hash;
  return url.origin === location.origin ? url.pathname : `${url.host}${url.pathname}`;
}

function identityAttributes(element: Element): Record<string, string> | undefined {
  const attributes: Record<string, string> = {};
  let count = 0;
  for (const { name, value } of element.attributes) {
    if (count >= MAX_ATTRS) break;
    if (name !== "id" && name !== "aria-label" && !name.startsWith("data-")) continue;
    if (!value || value.length > ATTR_VALUE_LIMIT) continue;
    attributes[name] = value;
    count += 1;
  }
  return count > 0 ? attributes : undefined;
}

// Element handles for this scan, keyed by transient node ID. Later stages
// (hit-testing SAM boxes, applying a plan) resolve IDs through this map.
export const nodeRegistry = new Map<string, WeakRef<Element>>();
// The reverse direction, for hit-testing: element → node ID.
export const elementIds = new WeakMap<Element, string>();
// Scroll position at scan time; boxes from the screenshot are only valid at this offset.
let scannedScroll = { x: 0, y: 0 };
// Which scan the registry belongs to. Node IDs are only meaningful together with it: callers pass
// the scan they mean, and a page that has been rescanned since refuses instead of guessing.
let registryScan = 0;
export const currentScan = () => registryScan;
export const scannedScrollOffset = () => scannedScroll;

// The tab's URL, which names the kind of page, when this script runs in a frame of the site's own
// that fills the window (see contentFrame in the background); the frame's otherwise.
function pageUrl(): string {
  try {
    return window.top?.location.href ?? location.href;
  } catch {
    return location.href;
  }
}

export function scanPage(): PageScan {
  const started = performance.now();
  const nodes: Array<ScanNode> = [];
  const skipped = { iframes: 0, shadowHosts: 0, canvases: 0 };
  const idOf = new Map<Element, string>();
  let truncated = false;

  nodeRegistry.clear();
  scannedScroll = { x: scrollX, y: scrollY };

  const nearestKept = (element: Element): string | undefined => {
    for (
      let current = element.parentElement;
      current;
      current = current.parentElement
    ) {
      const id = idOf.get(current);
      if (id) return id;
    }
    return undefined;
  };

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        const element = node as Element;
        if (SKIP_TAGS.has(element.tagName)) return NodeFilter.FILTER_REJECT;
        // Don't descend into graphics; the SVG itself is classified as media.
        if (element.parentElement?.closest("svg"))
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  for (
    let element = walker.nextNode() as Element | null;
    element;
    element = walker.nextNode() as Element | null
  ) {
    if (element.tagName === "IFRAME") {
      skipped.iframes += 1;
      continue;
    }
    if (element.tagName === "CANVAS") skipped.canvases += 1;
    if (element.shadowRoot) skipped.shadowHosts += 1;

    const rect = element.getBoundingClientRect();
    if (!intersectsViewport(rect) || !isRendered(element, rect)) continue;

    const kind = classify(element);
    if (!kind) continue;

    if (nodes.length >= MAX_NODES) {
      truncated = true;
      break;
    }

    const id = `n${nodes.length + 1}`;
    const parent = nearestKept(element);
    const parentDepth = parent
      ? nodes[Number(parent.slice(1)) - 1].depth
      : -1;
    const sensitive = element.matches(SENSITIVE_SELECTOR);

    idOf.set(element, id);
    nodeRegistry.set(id, new WeakRef(element));
    elementIds.set(element, id);
    nodes.push({
      id,
      parent,
      depth: parentDepth + 1,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role") ?? undefined,
      kind,
      text: snippet(element, sensitive),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      sensitive,
      href: sensitive ? undefined : linkPath(element),
      attrs: sensitive ? undefined : identityAttributes(element),
    });
  }

  return {
    url: pageUrl(),
    title: document.title,
    viewport: {
      w: innerWidth,
      h: innerHeight,
      dpr: devicePixelRatio,
      scrollX: Math.round(scrollX),
      scrollY: Math.round(scrollY),
    },
    nodes,
    truncated,
    skipped,
    durationMs: Math.round(performance.now() - started),
    scannedAt: (registryScan = Date.now()),
  };
}
