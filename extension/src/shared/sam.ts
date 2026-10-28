import type { Rect } from "./types";

// SAM 3.1 answers in a token grammar, one record per object:
//   <0f>0<|box;x1=780;y1=124;x2=866;y2=155;w=1280;h=900|><|mask;…|>,1<|box;…|>…
// Coordinates are in the image's pixels; x2/y2 are inclusive. Masks are ignored for now.

const BOX = /<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)\|>/g;

export type SamBox = { x1: number; y1: number; x2: number; y2: number; w: number; h: number };

export function parseSamBoxes(text: string): Array<SamBox> {
  return [...text.matchAll(BOX)].map(([, x1, y1, x2, y2, w, h]) => ({
    x1: Number(x1),
    y1: Number(y1),
    x2: Number(x2),
    y2: Number(y2),
    w: Number(w),
    h: Number(h),
  }));
}

// The screenshot is in device pixels; page boxes are in CSS pixels of the viewport.
export function toViewportRect(box: SamBox, viewportWidth: number): Rect {
  const scale = viewportWidth / box.w;
  return {
    x: Math.round(box.x1 * scale),
    y: Math.round(box.y1 * scale),
    w: Math.round((box.x2 - box.x1 + 1) * scale),
    h: Math.round((box.y2 - box.y1 + 1) * scale),
  };
}

export function intersectionOverUnion(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;
  const overlap = width * height;
  return overlap / (a.w * a.h + b.w * b.h - overlap);
}
