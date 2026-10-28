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
- operation per group, chosen for a person who uses this page repeatedly to get to what they need:
  compact (tighten spacing), grid (lay repeated cards out in a grid), emphasize (make the group stand out),
  hide-secondary (collapse low-value items), none (leave as is). Prefer none over a change you can't justify.
- reorderable: true only for groups where a user might want their own order (tabs, nav links, cards).
  identity says how to recognise the same item on another page of this kind: an attribute whose values are
  stable names (e.g. data-tab-item), else href, else text. Never an attribute holding counters or generated ids.
- template.urlPattern: which pages share this layout. Keep fixed path words, replace variable segments
  (names, ids, slugs) with {placeholders}, end with /* when sub-pages share it. Must match the current URL.
  Example: github.com/react/react/issues → github.com/{owner}/{repo}/*
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

export function describePage(scan: PageScan, visualGroups: Array<VisualGroup> | undefined): string {
  const sections = [
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
