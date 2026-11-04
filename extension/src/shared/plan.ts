import type { PageScan, ScanNode } from "./types";

// The layout plan Muse Spark returns. Every field is required (strict structured output);
// "not applicable" is expressed with "none" or an empty string rather than a missing key.

// collapse folds a region behind a one-tap "Show" toggle Harbor adds; restore removes it.
export const OPERATIONS = ["compact", "grid", "emphasize", "hide-secondary", "collapse", "none"] as const;
export const GROUP_ROLES = [
  "navigation",
  "tabs",
  "content-cards",
  "toolbar",
  "list",
  "sidebar",
  "promo",
  "footer",
  "other",
] as const;
export const IDENTITY_SOURCES = ["attribute", "href", "text", "none"] as const;

// "reorder" is Harbor's own, from learning: never offered to the model, so not in OPERATIONS.
export type Operation = (typeof OPERATIONS)[number] | "reorder";

export type PlanGroup = {
  label: string;
  // Pages this group exists on. Site chrome (section tabs) is broad; view content (an article) is narrow.
  // Plans saved before 28 Oct lack it and fall back to the plan's template.
  urlPattern: string;
  role: (typeof GROUP_ROLES)[number];
  container: string;
  members: Array<string>;
  operation: Operation;
  // Items the user may later reorder; needs an identity that holds across pages.
  reorderable: boolean;
  identity: { source: (typeof IDENTITY_SOURCES)[number]; attribute: string };
  reason: string;
  // The profile rule behind the change ("parts.ads"), "special", a guard, or "model". The panel
  // explains the change from it; absent on plans saved before profiles.
  rule?: string;
  // Set on groups the user made with "Hide something else"; Spark's groups leave it out.
  origin?: "user" | "learned";
  // A learned order ("reorder"): item keys (see itemKey) first to last. Kept as keys, not node IDs,
  // so the order survives the items being found again on another page or visit.
  orderKeys?: Array<string>;
};

// A question Spark asks after reading the page. Each option states the group changes it implies,
// so an answer is applied locally and instantly, without another model call.
export type PlanQuestion = {
  id: string;
  text: string;
  multiple: boolean;
  options: Array<{ label: string; effects: Array<{ group: string; operation: Operation }> }>;
};

export type LayoutPlan = {
  summary: string;
  // Which pages this layout could apply to, e.g. "example-news.com/{section}/*".
  template: { urlPattern: string; pageKind: string };
  groups: Array<PlanGroup>;
  // Absent on plans saved before questions existed.
  questions?: Array<PlanQuestion>;
};

const string = { type: "string" } as const;

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "template", "groups", "questions"],
  properties: {
    summary: string,
    template: {
      type: "object",
      additionalProperties: false,
      required: ["urlPattern", "pageKind"],
      properties: { urlPattern: string, pageKind: string },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "multiple", "options"],
        properties: {
          id: string,
          text: string,
          multiple: { type: "boolean" },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "effects"],
              properties: {
                label: string,
                effects: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["group", "operation"],
                    properties: { group: string, operation: { type: "string", enum: OPERATIONS } },
                  },
                },
              },
            },
          },
        },
      },
    },
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "label",
          "urlPattern",
          "role",
          "container",
          "members",
          "operation",
          "reorderable",
          "identity",
          "reason",
          "rule",
        ],
        properties: {
          label: string,
          urlPattern: string,
          role: { type: "string", enum: GROUP_ROLES },
          container: string,
          members: { type: "array", items: string },
          operation: { type: "string", enum: OPERATIONS },
          reorderable: { type: "boolean" },
          identity: {
            type: "object",
            additionalProperties: false,
            required: ["source", "attribute"],
            properties: {
              source: { type: "string", enum: IDENTITY_SOURCES },
              attribute: string,
            },
          },
          reason: string,
          rule: string,
        },
      },
    },
  },
} as const;

export const LIMITS = { groups: 15, members: 200 };

const bareHost = (host: string) => host.replace(/^www\./, "");

// "example-news.com/{section}/*" → matches example-news.com/world and example-news.com/world/storm.
export function urlPatternMatches(pattern: string, url: string): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  // "www." is dropped on both sides: the model writes "linkedin.com/*" for www.linkedin.com pages.
  const subject = `${bareHost(target.host)}${target.pathname}`.replace(/\/$/, "");
  const source = pattern
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .split(/({[^/}]+}|\*)/)
    .map((part) => {
      if (part === "*") return ".*";
      if (/^{[^/}]+}$/.test(part)) return "[^/]+";
      return part.replaceAll(/[$()+.?[\\\]^{|}]/g, String.raw`\$&`);
    })
    .join("");
  // A trailing "/*" also covers the bare prefix ("example-news.com/world").
  return new RegExp(`^${source.replace(/\/\.\*$/, "(?:/.*)?")}$`).test(subject);
}

export const groupPattern = (plan: LayoutPlan, group: PlanGroup) => group.urlPattern || plan.template.urlPattern;

// Site chrome (the page's own header, top navigation and footer) is the same on every page of a
// site, so its groups get the site-wide pattern whatever the model wrote: a change to the top bar
// follows the user from the feed to every other page. A nav or footer inside main or an article is
// content, not chrome.
const CHROME = (node: ScanNode) => ["header", "nav", "footer"].includes(node.tag) || ["banner", "navigation", "contentinfo"].includes(node.role ?? "");
const CONTENT = (node: ScanNode) => ["main", "article"].includes(node.tag) || node.role === "main" || node.role === "article";

export function siteWide(groups: Array<PlanGroup>, scan: PageScan): Array<PlanGroup> {
  const byId = new Map(scan.nodes.map((node) => [node.id, node]));
  const host = URL.canParse(scan.url) ? new URL(scan.url).host : undefined;
  const inChrome = (id: string) => {
    let chrome = false;
    for (let node = byId.get(id); node; node = node.parent ? byId.get(node.parent) : undefined) {
      if (CONTENT(node)) return false;
      if (CHROME(node)) chrome = true;
    }
    return chrome;
  };
  return host ? groups.map((group) => (inChrome(group.container) ? { ...group, urlPattern: `${host}/*` } : group)) : groups;
}

// A whole-site pattern, with or without "www.": the model's "linkedin.com/*" counts for www.linkedin.com.
export const isSiteWide = (pattern: string, url: string) =>
  URL.canParse(url) && pattern.replace(/^https?:\/\//, "").replace(/^www\./, "") === `${bareHost(new URL(url).host)}/*`;

function identityValue(node: ScanNode, group: PlanGroup): string | undefined {
  switch (group.identity.source) {
    case "attribute": {
      return node.attrs?.[group.identity.attribute];
    }
    case "href": {
      return node.href;
    }
    case "text": {
      // Counters ("Issues 12") are volatile; identity is the text without digits.
      return node.text.replaceAll(/\d+/g, "").trim() || undefined;
    }
    default: {
      return undefined;
    }
  }
}

function isInside(nodeId: string, containerId: string, byId: Map<string, ScanNode>): boolean {
  for (let current = byId.get(nodeId)?.parent; current; current = byId.get(current)?.parent)
    if (current === containerId) return true;
  return false;
}

export type Validation = {
  // Groups that passed every check, in the plan's order.
  accepted: Array<PlanGroup>;
  errors: Array<string>;
};

// Deterministic checks on a model plan. Nothing reaches the page unless it passes here.
export function validatePlan(plan: LayoutPlan, scan: PageScan): Validation {
  const byId = new Map(scan.nodes.map((node) => [node.id, node]));
  const errors: Array<string> = [];
  const accepted: Array<PlanGroup> = [];
  const claimed = new Set<string>();

  if (!urlPatternMatches(plan.template.urlPattern, scan.url))
    errors.push(`template.urlPattern "${plan.template.urlPattern}" does not match the current URL ${scan.url}`);

  if (plan.groups.length > LIMITS.groups)
    errors.push(`plan has ${plan.groups.length} groups; at most ${LIMITS.groups} are allowed`);

  for (const [index, group] of plan.groups.slice(0, LIMITS.groups).entries()) {
    const at = `groups[${index}] "${group.label}"`;
    const before = errors.length;
    const container = byId.get(group.container);

    if (!urlPatternMatches(groupPattern(plan, group), scan.url))
      errors.push(`${at}: urlPattern "${group.urlPattern}" does not match the current URL`);

    if (!container) errors.push(`${at}: container ${group.container} is not a scanned element`);
    else if (container.sensitive) errors.push(`${at}: container ${group.container} is a form field`);

    if (group.members.length === 0) errors.push(`${at}: has no members`);
    if (group.members.length > LIMITS.members)
      errors.push(`${at}: ${group.members.length} members; at most ${LIMITS.members}`);
    if ((group.operation === "grid" || group.reorderable) && group.members.length < 2)
      errors.push(`${at}: ${group.operation === "grid" ? "grid" : "reordering"} needs at least 2 members`);

    for (const id of new Set(group.members)) {
      const node = byId.get(id);
      if (!node) errors.push(`${at}: member ${id} is not a scanned element`);
      else if (node.sensitive) errors.push(`${at}: member ${id} is a form field and can't be changed`);
      // A single picked element is both the region and its only member.
      else if (container && id !== container.id && !isInside(id, container.id, byId))
        errors.push(`${at}: member ${id} is not inside container ${container.id}`);
      // The model's groups must not overlap. The user's own hides and accepted suggestions are
      // layered over them (one card of a planned grid, emphasised), so they may.
      if (!group.origin && claimed.has(id)) errors.push(`${at}: member ${id} already belongs to another group`);
    }
    if (new Set(group.members).size !== group.members.length) errors.push(`${at}: lists a member twice`);

    if (group.reorderable) {
      if (group.identity.source === "none")
        errors.push(`${at}: reorderable groups need an identity source`);
      else if (group.identity.source === "attribute" && !group.identity.attribute)
        errors.push(`${at}: identity source "attribute" needs an attribute name`);
      else {
        const values = group.members.map((id) => byId.get(id)).map((node) => node && identityValue(node, group));
        if (values.some((value) => !value))
          errors.push(`${at}: some members have no ${group.identity.source} identity (${group.identity.attribute || group.identity.source})`);
        else if (new Set(values).size !== values.length)
          errors.push(`${at}: ${group.identity.source} identity is not unique across members`);
      }
    }

    if (errors.length === before) {
      accepted.push(group);
      if (!group.origin) for (const id of group.members) claimed.add(id);
    }
  }

  return { accepted, errors };
}
