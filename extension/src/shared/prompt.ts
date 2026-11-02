import type { Profile } from "./profile";
import { GUARDS, profileBlock } from "./profile";
import type { PageScan, ScanNode } from "./types";

export type VisualGroup = { concept: string; parent: string; nodeIds: Array<string> };

// With a profile the user's own rules decide what changes; without one, Spark's built-in defaults do.
export function systemPrompt(withProfile: boolean): string {
  const operations = withProfile
    ? `- operation per group. The user returns to this page repeatedly. Change a group only under a rule id from
  the user's harbor, the special request (rule "special"), or, sparingly, as your own idea (rule "model") with
  a short reason. Every other group is none. Operations:
  hide-secondary (hidden; the user can show it again from the side panel), collapse (folded behind a one-tap
    "Show" toggle), compact (tighten spacing), grid (repeated cards laid out unevenly or in one long column),
    emphasize (bring forward), none (as the site has it).`
    : `- operation per group. The user returns to this page repeatedly; make it faster for them to use:
  hide-secondary (hidden; the user can show it again from the side panel) for regions they rarely need: stats, metadata, badges,
    language bars, promos, marketing navigation, "related" lists, footers.
  collapse (folded behind a one-tap "Show" toggle) for long regions they sometimes need, like comments.
  compact (tighten spacing) for dense lists, toolbars and sidebars they skim.
  grid for repeated cards laid out unevenly or in one long column.
  emphasize for the one or two regions that serve the user's goal.
  none for primary navigation and main content that already work as they are.
  If your reason calls a region low-value or rarely needed, its operation must not be none.
  When the user states a goal, emphasize what serves it and hide-secondary what doesn't.`;
  const questions = withProfile
    ? "- questions: return an empty list; the user's harbor already answers them."
    : `- questions: 1 to 3 short questions for the user whose answers would change this plan. Ask about what they
  do on this page, or what helps them read and use it (denser or roomier, fewer distractions). Never ask what
  the page already shows. Options are short (2-5 words); each lists the group changes it implies, naming
  groups by their exact label. Prefer single choice. When the user stated a goal, follow it in the plan and
  ask only about regions and preferences the goal leaves open.`;
  return `You configure layouts for web pages the user has never set up before.
You receive the visible elements of one page as a list, one per line:
  id <tag> kind parent=id [x,y,w,h] attrs href "text"
Optionally you also receive visual groups: elements that an image segmentation model found looking alike.

Return a layout plan:
- groups: coherent regions (navigation, tabs, cards, toolbars, lists, sidebars, promos, comments, footers). For
  each, the container is the closest common ancestor id and members are its repeated items. Use only ids from
  the list. Never include elements marked FORM.
${operations}
- rule: for every group, the id of the rule behind its operation: a rule id from the user's harbor, "special"
  for the special request, a guard id for a region a guard protects (operation none), or "model".
${questions}
- When the user's words name things to hide or keep, apply it to every place they appear (e.g. the same
  links in a header and in a sidebar), each as its own group if they have different containers.
- reorderable: true only for groups where a user might want their own order (tabs, nav links, cards).
  identity says how to recognise the same item on another page of this kind: an attribute whose values are
  stable names (e.g. data-section), else href, else text. Never an attribute holding counters or generated ids.
- urlPattern: which pages share a layout. Keep fixed path words, replace variable segments (names, ids,
  slugs) with {placeholders}, end with /* when sub-pages share it. Must match the current URL.
  template.urlPattern is the broadest pattern in the plan; template.pageKind is one word (news, shop, recipe,
  forum, docs, video, travel, forms, mail, social, other). Each group has its own urlPattern: site chrome that
  appears on every page of this kind (header, section tabs, nav) gets the broad one; content specific to this
  view (an article, a product grid, a comment thread) gets a pattern for this view only.
  Example on example-news.com/world/storm-season-forecast: section tabs → example-news.com/*,
  article body → example-news.com/{section}/{slug}
Be concise in label, reason and summary.`;
}

// The prompt used without a profile (and by the evaluation runs).
export const SYSTEM_PROMPT = systemPrompt(false);

function line(node: ScanNode): string {
  const parts = [
    node.id,
    `<${node.tag}>`,
    node.sensitive ? "FORM" : node.kind,
    node.parent ? `parent=${node.parent}` : "root",
    `[${node.rect.x},${node.rect.y},${node.rect.w},${node.rect.h}]`,
  ];
  if (node.attrs)
    parts.push(
      Object.entries(node.attrs)
        .map(([name, value]) => `${name}=${value}`)
        .join(" ")
    );
  if (node.href) parts.push(`href=${node.href}`);
  if (node.text) parts.push(JSON.stringify(node.text));
  return parts.join(" ");
}

export function describePage(
  scan: PageScan,
  visualGroups: Array<VisualGroup> | undefined,
  goal: string | undefined,
  profile?: Profile
): string {
  const sections = [
    ...(profile ? [profileBlock(profile), ""] : [GUARDS.map((rule) => `[${rule.id}] ${rule.text}`).join("\n"), ""]),
    ...(goal ? [`[special] Special request for this page only: ${goal}`] : []),
    `URL: ${scan.url}`,
    `Title: ${scan.title}`,
    `Viewport: ${scan.viewport.w}x${scan.viewport.h}${scan.truncated ? " (element list truncated)" : ""}`,
    "",
    "Elements:",
    ...scan.nodes.map((node) => line(node)),
  ];
  if (visualGroups) {
    sections.push(
      "",
      "Visual groups (segmentation of the screenshot):",
      ...(visualGroups.length > 0
        ? visualGroups.map((group) => `"${group.concept}" under ${group.parent}: ${group.nodeIds.join(", ")}`)
        : ["none found"])
    );
  }
  return sections.join("\n");
}
