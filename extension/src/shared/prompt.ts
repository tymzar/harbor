import type { PageScan, ScanNode } from "./types";

export type VisualGroup = { concept: string; parent: string; nodeIds: Array<string> };

export const SYSTEM_PROMPT = `You configure layouts for web pages the user has never set up before.
You receive the visible elements of one page as a list, one per line:
  id <tag> kind parent=id [x,y,w,h] attrs href "text"
Optionally you also receive visual groups: elements that an image segmentation model found looking alike.

Return a layout plan:
- groups: coherent regions (navigation, tabs, cards, toolbars, lists, sidebars, promos, footers). For each, the
  container is the closest common ancestor id and members are its repeated items. Use only ids from the list.
  Never include elements marked FORM.
- operation per group. The user returns to this page repeatedly; make it faster for them to use:
  hide-secondary (hidden; the user can show it again from the side panel) for regions they rarely need: stats, metadata, badges,
    language bars, promos, marketing navigation, "related" lists, footers.
  compact (tighten spacing) for dense lists, toolbars and sidebars they skim.
  grid for repeated cards laid out unevenly or in one long column.
  emphasize for the one or two regions that serve the user's goal.
  none for primary navigation and main content that already work as they are.
  A useful plan usually changes at least two regions; return only none when the page is already minimal.
  If your reason calls a region low-value or rarely needed, its operation must not be none.
  When the user states a goal, emphasize what serves it and hide-secondary what doesn't.
- questions: 1 to 3 short questions for the user whose answers would change this plan. Ask about what they
  do on this page, or what helps them read and use it (denser or roomier, fewer distractions). Never ask what
  the page already shows. Options are short (2-5 words); each lists the group changes it implies, naming
  groups by their exact label. Prefer single choice. When the user stated a goal, follow it in the plan and
  ask only about regions and preferences the goal leaves open.
- When the user's goal names things to hide or keep, apply it to every place they appear (e.g. the same
  actions in a header and in a sidebar), each as its own group if they have different containers.
- reorderable: true only for groups where a user might want their own order (tabs, nav links, cards).
  identity says how to recognise the same item on another page of this kind: an attribute whose values are
  stable names (e.g. data-tab-item), else href, else text. Never an attribute holding counters or generated ids.
- urlPattern: which pages share a layout. Keep fixed path words, replace variable segments (names, ids,
  slugs) with {placeholders}, end with /* when sub-pages share it. Must match the current URL.
  template.urlPattern is the broadest pattern in the plan. Each group has its own urlPattern: site chrome that
  appears on every page of this kind (header, repo tabs, nav) gets the broad one; content specific to this
  view (a file list, an issue list, a product grid) gets a pattern for this view only.
  Example on github.com/react/react: tabs → github.com/{owner}/{repo}/*, file list → github.com/{owner}/{repo}
Be concise in label, reason and summary.`;

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
  goal: string | undefined
): string {
  const sections = [
    ...(goal ? [`User's goal on this page: ${goal}`] : []),
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
