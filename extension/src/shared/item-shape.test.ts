import { describe, expect, it } from "vitest";

import type { ItemShape } from "./item-shape";
import { mergeShapes } from "./item-shape";

const shape = (change: Partial<ItemShape>): ItemShape => ({ tags: ["TR"], roles: [], classes: ["mail"], classless: false, kids: [["TD", "TD"]], ...change });

describe("mergeShapes", () => {
  it("keeps every kind seen so far", () => {
    const merged = mergeShapes(shape({ tags: ["ARTICLE"], kids: [["H2"]] }), shape({ tags: ["SECTION"], kids: [["IMG"]] }));
    expect(merged.tags).toEqual(["ARTICLE", "SECTION"]);
    expect(merged.kids).toEqual([["H2"], ["IMG"]]);
  });

  it("narrows to the classes still shared", () => {
    expect(mergeShapes(shape({ classes: ["mail", "unread"] }), shape({ classes: ["mail", "read"] })).classes).toEqual(["mail"]);
  });

  it("takes the newest classes when the site renamed them all", () => {
    expect(mergeShapes(shape({ classes: ["a1"] }), shape({ classes: ["b2"] })).classes).toEqual(["b2"]);
  });

  it("doesn't grow without end, and keeps the newest kinds", () => {
    let merged = shape({ kids: [] });
    for (let kind = 0; kind < 40; kind++) merged = mergeShapes(merged, shape({ kids: [[`K${kind}`]] }));
    expect(merged.kids).toHaveLength(12);
    expect(merged.kids.at(-1)).toEqual(["K39"]);
  });
});
