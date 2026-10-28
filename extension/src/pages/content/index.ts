import { applyLayout, restoreLayout } from "./apply";
import { inspectNodes } from "./inspect";
import { matchBoxes } from "./match";
import { adjustPick, endPick, pickElement } from "./pick";
import { scanPage } from "./scan";

// Injected on demand by the background worker (activeTab), never declared in the
// manifest. Injected once per scan; the latest copy wins so a reloaded extension
// never talks to a stale one. Matching, applying and picking reuse that scan's registry.
const api = {
  scan: scanPage,
  match: matchBoxes,
  apply: applyLayout,
  restore: restoreLayout,
  pick: pickElement,
  adjustPick,
  endPick,
  inspect: inspectNodes,
};

declare global {
  var smartWeb: typeof api | undefined;
}

// A previous copy may still have elements marked or a picker open; undo that before replacing it.
globalThis.smartWeb?.restore?.();
globalThis.smartWeb?.endPick?.();
globalThis.smartWeb = api;
