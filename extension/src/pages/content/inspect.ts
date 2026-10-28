import { nodeRegistry } from "./scan";

// What the evaluation runner checks on the page for one scanned element: is it still visible,
// and which operations Smart Web put on it or around it. Read-only.
export type Inspection = {
  id: string;
  found: boolean;
  visible: boolean;
  // Operations marked on the element or an ancestor.
  ops: Array<string>;
  // Operations marked on a descendant that covers at least half of the element's area
  // (grid and compact land on the items' own parent, which may sit below the region).
  coveringOps: Array<string>;
};

const OP = "data-smart-web-op";

const area = (rect: DOMRect) => rect.width * rect.height;

export function inspectNodes(ids: Array<string>): Array<Inspection> {
  return ids.map((id) => {
    const element = nodeRegistry.get(id)?.deref();
    if (!element?.isConnected) return { id, found: false, visible: false, ops: [], coveringOps: [] };
    const ops: Array<string> = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      const op = current.getAttribute(OP);
      if (op) ops.push(op);
    }
    const own = area(element.getBoundingClientRect());
    const coveringOps = [...element.querySelectorAll(`[${OP}]`)]
      .filter((marked) => own > 0 && area(marked.getBoundingClientRect()) >= own / 2)
      .map((marked) => marked.getAttribute(OP)!);
    return {
      id,
      found: true,
      visible: element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
      ops,
      coveringOps,
    };
  });
}
