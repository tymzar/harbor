import type { Operation, PlanGroup } from "./plan";

// The user's harbor: page preferences chosen once in onboarding, kept on this device and sent with
// every layout request as short rules. undefined means "as the site has it" and is never sent.

export type PartChoice = "hide" | "fold" | undefined;
export type Part = "ads" | "popups" | "recommendations" | "sidebarExtras" | "comments";

export type Profile = {
  version: 1;
  // "defaults" when the user skipped setup: Harbor's starting point, not their choices.
  source: "chosen" | "defaults";
  parts: Record<Part, PartChoice>;
  layout: {
    density: "roomy" | "compact" | undefined;
    structure: "list" | "grid" | undefined;
    emphasis: "search" | "main" | undefined;
  };
  learn: boolean;
};

// chrome.storage.local keys: the profile, and whether onboarding was finished or skipped.
export const PROFILE_KEY = "harborProfile";
export const ONBOARDING_KEY = "harborOnboarding";

// What each part means on any website, and which choices it allows.
export const PARTS: Array<{ part: Part; label: string; hint: string; fold: boolean }> = [
  { part: "ads", label: "Ads & sponsored", hint: "banners, sponsored posts", fold: false },
  { part: "popups", label: "Promo pop-ups", hint: "newsletter, app, offers", fold: false },
  { part: "recommendations", label: "More like this", hint: "related, most read", fold: true },
  { part: "sidebarExtras", label: "Sidebar extras", hint: "trending, widgets", fold: true },
  { part: "comments", label: "Comments", hint: "replies, reviews", fold: true },
];

// Harbor's starting point: the two parts almost nobody wants. Everything else stays as the site has it.
export const STARTING_POINT: Record<Part, PartChoice> = {
  ads: "hide",
  popups: "hide",
  recommendations: undefined,
  sidebarExtras: undefined,
  comments: undefined,
};

export function startingProfile(source: Profile["source"] = "defaults"): Profile {
  return { version: 1, source, parts: { ...STARTING_POINT }, layout: { density: undefined, structure: undefined, emphasis: undefined }, learn: true };
}

const PART_TEXT: Record<Part, string> = {
  ads: "ads and sponsored blocks",
  popups: "promo pop-ups (newsletter, app and offer banners)",
  recommendations: '"related", "more like this" and recommendation lists',
  sidebarExtras: "sidebar extras (trending, widgets)",
  comments: "comments, replies and reviews",
};

// Rule ids carry no value ("parts.comments", not "comments.fold"), so changing a choice keeps its history.
export type Rule = { id: string; text: string; operation?: Operation };

// The rules a profile sends; unset fields send nothing.
export function profileRules(profile: Profile): Array<Rule> {
  const rules: Array<Rule> = [];
  for (const { part } of PARTS) {
    const choice = profile.parts[part];
    if (choice === "hide") rules.push({ id: `parts.${part}`, text: `Hide ${PART_TEXT[part]} (hide-secondary).`, operation: "hide-secondary" });
    if (choice === "fold") rules.push({ id: `parts.${part}`, text: `Fold ${PART_TEXT[part]} behind a one-tap toggle (collapse).`, operation: "collapse" });
  }
  const { density, structure, emphasis } = profile.layout;
  if (density === "compact") rules.push({ id: "layout.density", text: "Tighten dense lists, feeds and toolbars (compact)." });
  if (density === "roomy") rules.push({ id: "layout.density", text: "Keep spacing roomy: never compact." });
  if (structure === "grid") rules.push({ id: "layout.structure", text: "Lay out repeated cards and products as a grid (grid)." });
  if (structure === "list") rules.push({ id: "layout.structure", text: "Keep repeated items as a list: never grid." });
  if (emphasis === "main") rules.push({ id: "layout.emphasis", text: "Bring the main content forward (emphasize)." });
  if (emphasis === "search") rules.push({ id: "layout.emphasis", text: "Bring search and the main navigation forward (emphasize)." });
  return rules;
}

// Always sent, profile or not.
export const GUARDS: Array<Rule> = [
  { id: "guard.consent", text: "Never hide, dismiss or answer cookie, consent or sign-in dialogs; return such a region as none." },
  { id: "guard.mainVideo", text: "Never treat the page's main video as clutter." },
  { id: "guard.form", text: "Never change a form the user is filling in." },
];

// Rule ids the model may put in a group's `rule`; anything else is read as "model".
export function allowedRules(profile: Profile | undefined, special: boolean): Set<string> {
  return new Set([...[...(profile ? profileRules(profile) : []), ...GUARDS].map((rule) => rule.id), ...(special ? ["special"] : []), "model"]);
}

// The block sent with a layout request, above the page's element list.
export function profileBlock(profile: Profile): string {
  const lines = [...profileRules(profile), ...GUARDS].map((rule) => `[${rule.id}] ${rule.text}`);
  return ["User's harbor (their own page preferences; one rule per line):", ...lines, "Leave everything else as the site has it."].join("\n");
}

// The user's value wins: a group under a profile rule gets the operation the profile implies;
// guards are never changed; a rule the request didn't send becomes "model".
export function clampToProfile(groups: Array<PlanGroup>, profile: Profile | undefined, special: boolean): Array<PlanGroup> {
  const allowed = allowedRules(profile, special);
  const implied = new Map((profile ? profileRules(profile) : []).flatMap((rule) => (rule.operation ? [[rule.id, rule.operation] as const] : [])));
  return groups.map((group) => {
    if (group.origin) return group;
    const rule = group.rule && allowed.has(group.rule) ? group.rule : "model";
    if (rule.startsWith("guard.")) return { ...group, rule, operation: "none" };
    const operation = implied.get(rule) ?? group.operation;
    return { ...group, rule, operation };
  });
}

// Why a change is there, in the user's words; built here from the rule, never written by the model.
export function because(group: PlanGroup, profile: Profile | undefined): string {
  const rule = group.rule;
  if (group.operation === "none") return rule?.startsWith("guard.") ? "Harbor never touches this" : "As the site has it";
  if (!rule || rule === "model") return group.reason ? `Muse Spark's own idea: ${group.reason}` : "Muse Spark's own idea";
  if (rule === "special") return "because of your special request";
  if (rule.startsWith("guard.")) return "Harbor never touches this";
  const starting = profile?.source === "defaults" ? "because of Harbor's starting point" : "because your harbor";
  const part = PARTS.find((entry) => `parts.${entry.part}` === rule);
  if (part) {
    const choice = profile?.parts[part.part];
    return `${starting}: ${part.label.toLowerCase()} ${choice === "fold" ? "folded" : "cleared"}`;
  }
  if (rule === "layout.density") return `${starting}: ${profile?.layout.density ?? "spacing"}`;
  if (rule === "layout.structure") return `${starting}: ${profile?.layout.structure ?? "structure"}`;
  if (rule === "layout.emphasis") return `${starting}: ${profile?.layout.emphasis === "search" ? "search first" : "content first"}`;
  return group.reason;
}

// A name for the picks, not a personality: density + what comes first.
export function harborName(profile: Profile): string {
  if (profile.source === "defaults") return "Calm defaults";
  const first = { roomy: "Calm", compact: "Quick", none: "Open" }[profile.layout.density ?? "none"];
  const second = { main: "reader", search: "navigator", none: "harbor" }[profile.layout.emphasis ?? "none"];
  return `${first} ${second}`;
}

// Short chips for the profile row: "Roomy list", "Content first", "2 cleared", "1 folded".
export function profileSummary(profile: Profile): Array<string> {
  const chips: Array<string> = [];
  const { density, structure, emphasis } = profile.layout;
  const shape = [density && density[0].toUpperCase() + density.slice(1), structure].filter(Boolean).join(" ");
  if (shape) chips.push(shape);
  if (emphasis) chips.push(emphasis === "search" ? "Search first" : "Content first");
  const choices = Object.values(profile.parts);
  const cleared = choices.filter((choice) => choice === "hide").length;
  const folded = choices.filter((choice) => choice === "fold").length;
  if (cleared) chips.push(`${cleared} cleared`);
  if (folded) chips.push(`${folded} folded`);
  return chips;
}
