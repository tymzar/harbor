import { matchBoxes } from "./match";
import { scanPage } from "./scan";

// Injected on demand by the background worker (activeTab), never declared in the
// manifest. Injected once per scan; the latest copy wins so a reloaded extension
// never talks to a stale one. Matching reuses the registry of the scan it follows.
declare global {
  var smartWeb: { scan: typeof scanPage; match: typeof matchBoxes } | undefined;
}

globalThis.smartWeb = { scan: scanPage, match: matchBoxes };
