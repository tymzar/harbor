import { applyLayout, restoreLayout } from "./apply";
import { matchBoxes } from "./match";
import { scanPage } from "./scan";

// Injected on demand by the background worker (activeTab), never declared in the
// manifest. Injected once per scan; the latest copy wins so a reloaded extension
// never talks to a stale one. Matching and applying reuse the registry of that scan.
declare global {
  var smartWeb:
    | { scan: typeof scanPage; match: typeof matchBoxes; apply: typeof applyLayout; restore: typeof restoreLayout }
    | undefined;
}

// A previous copy may still have elements marked; undo them before replacing it.
globalThis.smartWeb?.restore?.();
globalThis.smartWeb = { scan: scanPage, match: matchBoxes, apply: applyLayout, restore: restoreLayout };
