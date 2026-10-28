import { scanPage } from "./scan";

// Injected on demand by the background worker (activeTab), never declared in the
// manifest. It can run more than once per page; the first copy's state is kept.
declare global {
  var smartWeb: { scan: typeof scanPage } | undefined;
}

globalThis.smartWeb ??= { scan: scanPage };
