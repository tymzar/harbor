import { nodeRegistry } from "./scan";

// What the evaluation runner checks on the page for one scanned element: is it still visible,
// and which operations Harbor put on it or around it. Read-only.
export type Inspection = {
  id: string;
  found: boolean;
  visible: boolean;
  // Still shows something: visible text or media. A wrapper whose contents were all hidden is
  // visible to the browser but empty on screen.
  hasContent: boolean;
  // Operations marked on the element or an ancestor.
  ops: Array<string>;
  // Operations marked on a descendant that covers at least half of the element's area
  // (grid and compact land on the items' own parent, which may sit below the region).
  coveringOps: Array<string>;
};

const OP = "data-smart-web-op";

const area = (rect: DOMRect) => rect.width * rect.height;

const MEDIA = "img, svg, video, canvas, picture, iframe, input, select, textarea, button";
const shown = (element: Element) => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });

function hasContent(element: Element): boolean {
  // innerText, not textContent: it leaves out text the page's CSS hides.
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content
  if (element instanceof HTMLElement && element.innerText.trim() !== "") return true;
  return [element, ...element.querySelectorAll(MEDIA)].some(
    (candidate) => candidate.matches(MEDIA) && shown(candidate) && area(candidate.getBoundingClientRect()) > 0
  );
}

export function inspectNodes(ids: Array<string>): Array<Inspection> {
  return ids.map((id) => {
    const element = nodeRegistry.get(id)?.deref();
    if (!element?.isConnected) return { id, found: false, visible: false, hasContent: false, ops: [], coveringOps: [] };
    const ops: Array<string> = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      const op = current.getAttribute(OP);
      if (op) ops.push(op);
    }
    const own = area(element.getBoundingClientRect());
    const coveringOps = [...element.querySelectorAll(`[${OP}]`)]
      .filter((marked) => own > 0 && area(marked.getBoundingClientRect()) >= own / 2)
      .map((marked) => marked.getAttribute(OP)!);
    const visible = shown(element);
    return {
      id,
      found: true,
      visible,
      hasContent: visible && hasContent(element),
      ops,
      coveringOps,
    };
  });
}
