import { nodeRegistry, scanPage } from "../../src/pages/content/scan";
import "./dom-mutate";

// The extension's own scanner, bundled for a plain page, plus the ground truth the DOM mutations
// left on elements: which original element each scanned node is (fpOrigin), which one a cloned
// row copies (fpCloneOf), and which one an inserted wrapper stands for (fpSameAs).
type Marked = Element & { fpOrigin?: string; fpCloneOf?: string; fpSameAs?: string };

declare global {
  var fpMark: () => void;
  var fpScan: () => { scan: ReturnType<typeof scanPage>; origin: Array<string | undefined>; cloneOf: Array<string | undefined>; sameAs: Array<string | undefined> };
}

globalThis.fpMark = () => {
  for (const [index, element] of [...document.querySelectorAll("body *")].entries()) (element as Marked).fpOrigin = `e${index}`;
};

globalThis.fpScan = () => {
  const scan = scanPage();
  const element = (id: string) => nodeRegistry.get(id)?.deref() as Marked | undefined;
  return {
    scan,
    origin: scan.nodes.map((node) => element(node.id)?.fpOrigin),
    cloneOf: scan.nodes.map((node) => element(node.id)?.fpCloneOf),
    sameAs: scan.nodes.map((node) => element(node.id)?.fpSameAs),
  };
};
