import type { PageScan, ScanNode } from "./types";

// The layout plan Muse Spark returns. Every field is required (strict structured output);
// "not applicable" is expressed with "none" or an empty string rather than a missing key.

export const OPERATIONS = ["compact", "grid", "emphasize", "hide-secondary", "none"] as const;
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

export type Operation = (typeof OPERATIONS)[number];

export type PlanGroup = {
  label: string;
  // Pages this group exists on. Site chrome (repo tabs) is broad; view content (a file list) is narrow.
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
};

export type LayoutPlan = {
  summary: string;
  // Which pages this layout could apply to, e.g. "github.com/{owner}/{repo}/*".
  template: { urlPattern: string; pageKind: string };
  groups: Array<PlanGroup>;
};

const string = { type: "string" } as const;

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "template", "groups"],
  properties: {
    summary: string,
    template: {
      type: "object",
      additionalProperties: false,
      required: ["urlPattern", "pageKind"],
      properties: { urlPattern: string, pageKind: string },
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
        },
      },
    },
  },
} as const;

export const LIMITS = { groups: 15, members: 200 };

// "github.com/{owner}/{repo}/*" → matches github.com/react/react and github.com/react/react/issues.
export function urlPatternMatches(pattern: string, url: string): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  const subject = `${target.host}${target.pathname}`.replace(/\/$/, "");
  const source = pattern
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .split(/({[^/}]+}|\*)/)
    .map((part) => {
      if (part === "*") return ".*";
      if (/^{[^/}]+}$/.test(part)) return "[^/]+";
      return part.replaceAll(/[$()+.?[\\\]^{|}]/g, String.raw`\$&`);
    })
    .join("");
  // A trailing "/*" also covers the bare prefix ("github.com/a/b").
  return new RegExp(`^${source.replace(/\/\.\*$/, "(?:/.*)?")}$`).test(subject);
}

export const groupPattern = (plan: LayoutPlan, group: PlanGroup) => group.urlPattern || plan.template.urlPattern;

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
      else if (container && !isInside(id, container.id, byId))
        errors.push(`${at}: member ${id} is not inside container ${container.id}`);
      if (claimed.has(id)) errors.push(`${at}: member ${id} already belongs to another group`);
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
      for (const id of group.members) claimed.add(id);
    }
  }

  return { accepted, errors };
}
