import { describe, expect, it } from "vitest";

import { MIN_USES, ORDER_MIN_USES, decision, emptyLearning, itemKey, recordUse, suggest, suggestOrder } from "./learning";
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

// Clicks in the order given, one use each: ["n4","n4","n3"] is Trail twice, then Summit.
function clicks(ids: Array<string>) {
  const learning = emptyLearning();
  for (const id of ids) {
    const node = nodes.find((entry) => entry.id === id)!;
    learning.groups[cards.label] = recordUse(learning.groups[cards.label], itemKey(node, cards));
  }
  return learning;
}

const keyOf = (id: string) => itemKey(nodes.find((node) => node.id === id)!, cards);

describe("suggestOrder", () => {
  const mostTrail = [...Array.from({ length: 5 }, () => "n4"), ...Array.from({ length: 3 }, () => "n3")];

  it("waits for enough clicks in the group", () => {
    expect(suggestOrder(clicks(mostTrail.slice(0, ORDER_MIN_USES - 1)), cards, members)).toBeUndefined();
  });

  it("ranks the used items, then the unused ones in page order", () => {
    const offer = suggestOrder(clicks(mostTrail), cards, members)!;
    expect(offer.kind).toBe("order");
    expect(offer.order).toEqual([keyOf("n4"), keyOf("n3"), keyOf("n2")]);
    expect(offer.text).toBe("Trail 22 $99 · Summit 45 $219 · Ridge 28 $129");
    expect(offer.uses).toBe(ORDER_MIN_USES);
  });

  it("offers nothing when the page's order, or the order in place, already matches", () => {
    const pageOrder = [...Array.from({ length: 5 }, () => "n2"), ...Array.from({ length: 3 }, () => "n3")];
    expect(suggestOrder(clicks(pageOrder), cards, members)).toBeUndefined();
    const offer = suggestOrder(clicks(mostTrail), cards, members)!;
    expect(suggestOrder(clicks(mostTrail), cards, members, undefined, offer.order)).toBeUndefined();
  });

  it("is not offered again once decided", () => {
    const learning = clicks(mostTrail);
    const offer = suggestOrder(learning, cards, members)!;
    learning.decided.push(decision(cards.label, offer.item));
    expect(suggestOrder(learning, cards, members)).toBeUndefined();
  });
});
