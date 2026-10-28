import { describe, expect, it } from "vitest";

import { intersectionOverUnion, parseSamBoxes, toViewportRect } from "./sam";

// Start of a real response for "button" on reports/screens/visuals-after.png (27 Oct probe).
const SAMPLE =
  "<0f>0<|box;x1=780;y1=124;x2=866;y2=155;w=1280;h=900|><|mask;x=0;y=0;data=32,87,~!!!&i|>," +
  "1<|box;x1=275;y1=293;x2=598;y2=328;w=1280;h=900|><|mask;x=0;y=0;data=1,2|>";

describe("parseSamBoxes", () => {
  it("reads every box and ignores masks", () => {
    expect(parseSamBoxes(SAMPLE)).toEqual([
      { x1: 780, y1: 124, x2: 866, y2: 155, w: 1280, h: 900 },
      { x1: 275, y1: 293, x2: 598, y2: 328, w: 1280, h: 900 },
    ]);
  });

  it("treats an empty answer as zero matches", () => {
    expect(parseSamBoxes("")).toEqual([]);
  });
});

describe("toViewportRect", () => {
  it("scales device pixels down to CSS pixels, x2 inclusive", () => {
    const box = { x1: 200, y1: 100, x2: 399, y2: 149, w: 2560, h: 1600 };
    expect(toViewportRect(box, 1280)).toEqual({ x: 100, y: 50, w: 100, h: 25 });
  });
});

describe("intersectionOverUnion", () => {
  it("is 1 for identical boxes, 0 for disjoint, partial otherwise", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(intersectionOverUnion(a, a)).toBe(1);
    expect(intersectionOverUnion(a, { x: 20, y: 0, w: 10, h: 10 })).toBe(0);
    expect(intersectionOverUnion(a, { x: 5, y: 0, w: 10, h: 10 })).toBeCloseTo(50 / 150);
  });
});
