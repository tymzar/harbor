import { currentScan, elementIds, readableText } from "./scan";

// "Hide something else": the user points at the page and clicks. Only scanned elements can be
// picked, so the result is always a node the plan can refer to. The click is captured and never
// reaches the site. After the click the selection stays highlighted; the side panel then widens,
// narrows, confirms or cancels it, which works without focus on the page.

// scannedAt: the scan the node ID belongs to; the background refuses to act on another one.
export type PickSelection = { nodeId: string; description: string; scannedAt: number };

const POINT_TIMEOUT_MS = 60_000;
const BLOCKED = ["pointerdown", "pointerup", "mousedown", "mouseup", "auxclick", "dblclick", "contextmenu"];

let overlay: HTMLElement | undefined;
let caption: HTMLElement | undefined;
let selected: Element | undefined;
let narrower: Array<Element> = [];
let stopPointing: (() => void) | undefined;

// Escape on the page cancels picking.
function onPickKey(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  block(event);
  endPick();
}

// Swallows an event so the site never sees the pointer while picking.
function block(event: Event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function scannedFrom(element: Element | null): Element | undefined {
  for (let current = element; current; current = current.parentElement) if (elementIds.has(current)) return current;
  return undefined;
}

function describe(element: Element): string {
  return `<${element.tagName.toLowerCase()}> ${readableText(element, 50)}`.trim();
}

function ensureOverlay(): HTMLElement {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.dataset.smartWebPicker = "";
  Object.assign(overlay.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483647",
    outline: "2px solid rgb(14 124 134)",
    background: "rgb(14 124 134 / 0.14)",
    borderRadius: "4px",
  });
  caption = document.createElement("div");
  Object.assign(caption.style, {
    position: "absolute",
    left: "0",
    bottom: "100%",
    marginBottom: "4px",
    padding: "2px 6px",
    borderRadius: "4px",
    background: "rgb(14 124 134)",
    color: "white",
    font: "12px/1.4 system-ui, sans-serif",
    whiteSpace: "nowrap",
  });
  overlay.append(caption);
  // On <html>, not inside the site's own trees, so frameworks managing <body> aren't disturbed.
  document.documentElement.append(overlay);
  return overlay;
}

function highlight(element: Element) {
  const box = ensureOverlay();
  const rect = element.getBoundingClientRect();
  Object.assign(box.style, {
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  caption!.textContent = describe(element);
}

function selection(): PickSelection | undefined {
  const nodeId = selected && elementIds.get(selected);
  return nodeId ? { nodeId, description: describe(selected!), scannedAt: currentScan() } : undefined;
}

export function endPick() {
  stopPointing?.();
  overlay?.remove();
  overlay = undefined;
  caption = undefined;
  selected = undefined;
  narrower = [];
}

// Resolves when the user clicks an element (or with undefined on Escape or timeout).
export function pickElement(): Promise<PickSelection | undefined> {
  endPick();
  return new Promise((resolve) => {
    let hovered: Element | undefined;
    // At most once per frame, reading before writing: moving the overlay and then measuring the
    // next element on every pointer event forced a full layout each time on heavy pages.
    let pointer: { x: number; y: number } | undefined;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        const element = pointer && scannedFrom(document.elementFromPoint(pointer.x, pointer.y));
        if (!element || element === hovered) return;
        hovered = element;
        highlight(element);
      });
    };
    const onClick = (event: MouseEvent) => {
      block(event);
      // Where the click landed, not the last highlight, which may be a frame behind.
      const element = scannedFrom(document.elementFromPoint(event.clientX, event.clientY)) ?? hovered;
      if (!element) return;
      selected = element;
      highlight(element);
      finish(selection());
    };
    const timer = setTimeout(() => endPick(), POINT_TIMEOUT_MS);

    function stop() {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      globalThis.removeEventListener("pointermove", onMove, true);
      globalThis.removeEventListener("click", onClick, true);
      globalThis.removeEventListener("keydown", onPickKey, true);
      for (const type of BLOCKED) globalThis.removeEventListener(type, block, true);
      stopPointing = undefined;
    }
    function finish(result?: PickSelection) {
      stop();
      resolve(result);
    }
    // Ending the pick from anywhere (Escape, timeout, the panel) resolves the promise once.
    stopPointing = () => finish();

    globalThis.addEventListener("pointermove", onMove, true);
    globalThis.addEventListener("click", onClick, true);
    globalThis.addEventListener("keydown", onPickKey, true);
    for (const type of BLOCKED) globalThis.addEventListener(type, block, true);
  });
}

// Moves the selection to the enclosing scanned element, or back to the one it came from.
export function adjustPick(direction: "wider" | "narrower"): PickSelection | undefined {
  if (!selected) return undefined;
  if (direction === "wider") {
    const parent = scannedFrom(selected.parentElement);
    if (parent && parent !== document.body && parent !== document.documentElement) {
      narrower.push(selected);
      selected = parent;
    }
  } else if (narrower.length > 0) {
    selected = narrower.pop();
  }
  highlight(selected!);
  return selection();
}
