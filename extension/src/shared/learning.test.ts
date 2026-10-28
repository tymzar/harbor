import { describe, expect, it } from "vitest";

import { MIN_USES, decision, emptyLearning, itemKey, recordUse, suggest } from "./learning";
import type { PlanGroup } from "./plan";
import type { ScanNode } from "./types";

const card = (id: string, text: string): ScanNode => ({
  id,
  parent: "n1",
  depth: 1,
  tag: "div",
  role: undefined,
  kind: "item",
  text,
  rect: { x: 0, y: 0, w: 100, h: 100 },
  sensitive: false,
});

const cards: PlanGroup = {
  label: "Backpack cards",
  urlPattern: "shop.example/*",
  role: "content-cards",
  container: "n1",
  members: ["n2", "n3", "n4"],
  operation: "grid",
  reorderable: false,
  identity: { source: "none", attribute: "" },
  reason: "",
};
const nodes = [card("n2", "Ridge 28 $129"), card("n3", "Summit 45 $219"), card("n4", "Trail 22 $99")];
const members = nodes.map((node) => ({ node, key: itemKey(node, cards) }));

function used(times: number, node = nodes[1]) {
  const learning = emptyLearning();
  for (let index = 0; index < times; index += 1)
    learning.groups[cards.label] = recordUse(learning.groups[cards.label], itemKey(node, cards));
  return learning;
}

describe("learning", () => {
  it("recognises an item by its text without prices or counters", () => {
    expect(itemKey(nodes[1], cards)).toBe("Summit $");
    expect(itemKey({ ...nodes[1], attrs: { "data-tab-item": "pulls" } }, { ...cards, identity: { source: "attribute", attribute: "data-tab-item" } })).toBe(
      "data-tab-item=pulls"
    );
  });

  it("suggests the item the user keeps opening, once it clearly leads", () => {
    expect(suggest(used(MIN_USES - 1), cards, members)).toBeUndefined();
    expect(suggest(used(MIN_USES), cards, members)).toMatchObject({ group: "Backpack cards", item: "Summit $", uses: MIN_USES });
  });

  it("does not suggest when uses are spread out", () => {
    let learning = used(3, nodes[0]);
    for (const node of [nodes[1], nodes[1], nodes[1], nodes[2], nodes[2], nodes[2]])
      learning = { ...learning, groups: { [cards.label]: recordUse(learning.groups[cards.label], itemKey(node, cards)) } };
    expect(suggest(learning, cards, members)).toBeUndefined();
  });

  it("never offers a decided suggestion again, nor one for a hidden group", () => {
    const learning = used(5);
    expect(suggest({ ...learning, decided: [decision(cards.label, "Summit $")] }, cards, members)).toBeUndefined();
    expect(suggest(learning, { ...cards, operation: "hide-secondary" }, members)).toBeUndefined();
  });
});
