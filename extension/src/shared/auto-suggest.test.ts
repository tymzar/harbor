import { describe, expect, it } from "vitest";

import { AUTO_SUGGEST_WINDOW_MS, markSuggested, pageShape, suggestedRecently } from "./auto-suggest";

describe("pageShape", () => {
  it("keeps the host and a plain path, without www., query or fragment", () => {
    expect(pageShape("https://www.example.com/docs/guide?tab=2#top")).toBe("example.com/docs/guide");
    expect(pageShape("http://127.0.0.1:4317/new-kind/catalog.html?again=1")).toBe("127.0.0.1:4317/new-kind/catalog.html");
  });

  it("replaces ids, tokens and long slugs with {x}", () => {
    expect(pageShape("https://shop.example/items/12345")).toBe("shop.example/items/{x}");
    expect(pageShape("https://shop.example/items/12345/reviews")).toBe("shop.example/items/{x}/reviews");
    expect(pageShape("https://news.example/story/the-storm-that-closed-the-harbour-overnight")).toBe("news.example/story/{x}");
    expect(pageShape("https://video.example/watch/dQw4w9WgXcQ1")).toBe("video.example/watch/{x}");
  });

  it("leaves short words alone", () => {
    expect(pageShape("https://shop.example/catalog/backpacks")).toBe("shop.example/catalog/backpacks");
    expect(pageShape("https://shop.example/")).toBe("shop.example");
  });

  it("is undefined for something that isn't a URL", () => {
    expect(pageShape("not a url")).toBeUndefined();
  });
});

describe("the daily cap", () => {
  const shape = "shop.example/items/{x}";

  it("allows a first request and blocks a second within a day", () => {
    const now = 1_000_000;
    expect(suggestedRecently({}, shape, now)).toBe(false);
    const record = markSuggested({}, shape, now);
    expect(suggestedRecently(record, shape, now + 60_000)).toBe(true);
    expect(suggestedRecently(record, shape, now + AUTO_SUGGEST_WINDOW_MS - 1)).toBe(true);
    expect(suggestedRecently(record, shape, now + AUTO_SUGGEST_WINDOW_MS)).toBe(false);
  });

  it("counts kinds of page apart", () => {
    const record = markSuggested({}, shape, 0);
    expect(suggestedRecently(record, "shop.example/catalog", 1)).toBe(false);
  });

  it("drops entries older than a day when marking", () => {
    const old = markSuggested({}, "shop.example/old", 0);
    const next = markSuggested(old, shape, AUTO_SUGGEST_WINDOW_MS + 1);
    expect(Object.keys(next)).toEqual([shape]);
  });
});
