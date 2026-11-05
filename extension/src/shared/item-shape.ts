// What the items of a list look like, remembered per kept change: a later page may show fewer of
// them, or only some of their kinds (unread rows only, one row in view), and the change still has to
// reach the same items. Tags and class names only, never text.

export type ItemShape = {
  tags: Array<string>;
  roles: Array<string | null>;
  // Classes every named item has; read and unread rows differ by others.
  classes: Array<string>;
  classless: boolean;
  // Each kind of named item: its children's tags, sorted.
  kids: Array<Array<string>>;
};

// Kinds kept per list, newest last: a site with endless kinds is not telling them apart this way.
const MAX_KINDS = 12;

// What is known so far plus what this page shows: each kind seen stays known. Classes narrow to the
// ones still shared; none left means the site renamed them (hashed names on a new build), so the
// newest stand.
export function mergeShapes(known: ItemShape, seen: ItemShape): ItemShape {
  const shared = known.classes.filter((name) => seen.classes.includes(name));
  const kinds = new Map([...known.kids, ...seen.kids].map((kids) => [kids.join(" "), kids]));
  return {
    tags: [...new Set([...known.tags, ...seen.tags])],
    roles: [...new Set([...known.roles, ...seen.roles])],
    classes: shared.length > 0 ? shared : seen.classes,
    classless: known.classless && seen.classless,
    kids: [...kinds.values()].slice(-MAX_KINDS),
  };
}
