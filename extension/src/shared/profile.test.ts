import { describe, expect, it } from "vitest";

import type { PlanGroup } from "./plan";
import type { Profile } from "./profile";
import { allowedRules, because, clampToProfile, harborName, profileBlock, profileRules, startingProfile } from "./profile";

const profile: Profile = {
  ...startingProfile("chosen"),
  parts: { ads: "hide", popups: "hide", recommendations: undefined, sidebarExtras: undefined, comments: "fold" },
  layout: { density: "roomy", structure: "list", emphasis: "main" },
};

const group = (rule: string | undefined, operation: PlanGroup["operation"], label = "Region"): PlanGroup => ({
  label,
  urlPattern: "example-news.com/*",
  role: "other",
  container: "n1",
  members: ["n2"],
  operation,
  reorderable: false,
  identity: { source: "none", attribute: "" },
  reason: "Spark's reason",
  rule,
});

describe("profile", () => {
  it("sends only rules the user set, plus the guards", () => {
    const ids = profileRules(profile).map((rule) => rule.id);
    expect(ids).toEqual(["parts.ads", "parts.popups", "parts.comments", "layout.density", "layout.structure", "layout.emphasis"]);
    const block = profileBlock(profile);
    expect(block).toContain("[parts.comments] Fold");
    expect(block).toContain("[guard.consent]");
    expect(block).not.toContain("recommendation");
  });

  it("leaves unset parts out entirely", () => {
    const empty: Profile = { ...startingProfile("chosen"), parts: { ads: undefined, popups: undefined, recommendations: undefined, sidebarExtras: undefined, comments: undefined } };
    expect(profileRules(empty)).toEqual([]);
  });

  it("lets the user's value win over the model's operation", () => {
    const [comments] = clampToProfile([group("parts.comments", "hide-secondary")], profile, false);
    expect(comments.operation).toBe("collapse");
  });

  it("never changes a guarded region, and reads unknown rules as the model's own idea", () => {
    const [guarded, unknown, special] = clampToProfile(
      [group("guard.consent", "hide-secondary"), group("parts.sidebarExtras", "hide-secondary"), group("special", "emphasize")],
      profile,
      false
    );
    expect(guarded.operation).toBe("none");
    expect(unknown.rule).toBe("model");
    expect(unknown.operation).toBe("hide-secondary");
    expect(special.rule).toBe("model");
    expect(allowedRules(profile, true).has("special")).toBe(true);
  });

  it("explains changes from the rule, not from the model", () => {
    expect(because(group("parts.ads", "hide-secondary"), profile)).toBe("because your harbor: ads & sponsored cleared");
    expect(because(group("parts.ads", "hide-secondary"), startingProfile())).toBe("because of Harbor's starting point: ads & sponsored cleared");
    expect(because(group("model", "compact"), profile)).toBe("Muse Spark's own idea: Spark's reason");
    expect(because(group("model", "none"), profile)).toBe("As the site has it");
  });

  it("names the picks", () => {
    expect(harborName(profile)).toBe("Calm reader");
    expect(harborName(startingProfile())).toBe("Calm defaults");
  });
});
