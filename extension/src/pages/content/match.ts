import type { Rect } from "../../shared/types";
import { intersectionOverUnion } from "../../shared/sam";
import { elementIds, scannedScrollOffset } from "./scan";

// A box this similar to an element's border box is taken to be that element.
const MIN_IOU = 0.5;

export type BoxMatch = { box: number; nodeId: string | undefined; iou: number };

function toRect(rect: DOMRect): Rect {
  return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
}

// For each box (viewport CSS pixels), find the scanned element whose box it best matches.
// Candidates are the elements under the box centre and their scanned ancestors.
export function matchBoxes(boxes: Array<Rect>): Array<BoxMatch> | { error: string } {
  const scrolled = scannedScrollOffset();
  if (Math.abs(scrolled.x - scrollX) > 2 || Math.abs(scrolled.y - scrollY) > 2)
    return { error: "The page scrolled after it was read. Rescan, then try again." };

  return boxes.map((box, index) => {
    let best: BoxMatch = { box: index, nodeId: undefined, iou: 0 };
    const seen = new Set<Element>();
    for (const hit of document.elementsFromPoint(box.x + box.w / 2, box.y + box.h / 2)) {
      for (let element: Element | null = hit; element && !seen.has(element); element = element.parentElement) {
        seen.add(element);
        const nodeId = elementIds.get(element);
        if (!nodeId) continue;
        const iou = intersectionOverUnion(box, toRect(element.getBoundingClientRect()));
        if (iou > best.iou) best = { box: index, nodeId, iou };
      }
    }
    return best.iou >= MIN_IOU ? best : { box: index, nodeId: undefined, iou: best.iou };
  });
}
