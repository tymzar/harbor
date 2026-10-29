import { describe, expect, it } from "vitest";

import type { Catalog } from "../../../src/model/ranker";
import { RAW_MODEL_FEATURES } from "../../../src/signals/features";
import { MAX_ITEMS, blendedScores, itemId, mergeCatalog, rankerFor } from "./page-ranker";

const cards = (...keys: Array<string>) => ({ id: "Cards", items: keys.map((key) => itemId("Cards", key)) });
// A typical press: ~100 ms down, steady approach, some hover; time of day at noon.
const press = Float32Array.from([4.6, 0.5, 0.2, 0.8, 0.5, 4.5, 1, 0, -1]);
const none = () => 0;
const usedItem44 = (id: string) => (id.endsWith("item 44") ? 10 : 0);

function trained(catalog: Catalog, item: string, times: number) {
  const ranker = rankerFor(catalog);
  for (let index = 0; index < times; index += 1) ranker.step(press, itemId("Cards", item), "open", "Cards", index * 5000);
  return { catalog, model: ranker.toPersisted() };
}

describe("page ranker", () => {
  it("expects model features of the size the network reads", () => {
    expect(press.length).toBe(RAW_MODEL_FEATURES);
  });

  it("reloads a saved model for the same catalog unchanged", () => {
    const saved = trained({ groups: [cards("Ridge", "Summit", "Trail")] }, "Summit", 6);
    const ranker = rankerFor(saved.catalog, saved);
    expect(ranker.examples).toBe(6);
    const scores = blendedScores(ranker);
    expect(scores.get(itemId("Cards", "Summit"))).toBeGreaterThan(scores.get(itemId("Cards", "Ridge"))!);
  });

  it("grows for a new item and a new group without forgetting the favourite", () => {
    const saved = trained({ groups: [cards("Ridge", "Summit", "Trail")] }, "Summit", 6);
    const grown: Catalog = { groups: [cards("Ridge", "Summit", "Trail", "Alpine"), { id: "Tabs", items: [itemId("Tabs", "Code"), itemId("Tabs", "Issues")] }] };
    const ranker = rankerFor(grown, saved);
    expect(ranker.shape).toMatchObject({ inputs: 9 + 2, outputs: 6 });
    expect(ranker.examples).toBe(6);
    const scores = blendedScores(ranker);
    const summit = scores.get(itemId("Cards", "Summit"))!;
    for (const other of ["Ridge", "Trail", "Alpine"]) expect(summit).toBeGreaterThan(scores.get(itemId("Cards", other))!);
    // The network's own weights for Summit came across, not only its click count.
    const hidden = ranker.shape.hidden;
    const before = rankerFor(saved.catalog, saved);
    const row = (r: typeof ranker, k: number) => r.weights.W2.slice(k * hidden, (k + 1) * hidden);
    expect(row(ranker, ranker.index.item(itemId("Cards", "Summit")))).toEqual(row(before, before.index.item(itemId("Cards", "Summit"))));
    // The new group starts from the uniform prior.
    expect(scores.get(itemId("Tabs", "Code"))).toBeCloseTo(0.5, 1);
  });

  it("keeps the page's items and the most used others when trimming", () => {
    const many = Array.from({ length: MAX_ITEMS + 5 }, (_, index) => `item ${index}`);
    const previous: Catalog = { groups: [cards(...many)] };
    const merged = mergeCatalog(previous, { groups: [cards("New one")] }, usedItem44, none);
    const items = merged.groups[0].items;
    expect(items).toHaveLength(MAX_ITEMS);
    expect(items).toContain(itemId("Cards", "New one"));
    expect(items).toContain(itemId("Cards", "item 44"));
  });
});
