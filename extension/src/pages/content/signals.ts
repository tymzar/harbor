// How the user clicks, for the learning model: the pre-event pointer feature extractor
// (src/signals/extractor.ts, written for the Harbor app, reused as credited) fed from this page's
// pointer events. Only the press's derived numbers leave this script (speed, hover time, press
// length, time of day), never positions, targets or text.
import { FeatureExtractor } from "../../../../src/signals/extractor";
import { selectModelFeatures } from "../../../../src/signals/features";

let extractor: FeatureExtractor | undefined;
let detach: (() => void) | undefined;

export type Item = { key: string; element: Element };

// itemAt names the learnable item under the pointer (or nothing): hover time counts per item, and
// the press is measured against the item's box, as Harbor measured it against its card.
export function startSignals(itemAt: (target: EventTarget | null) => Item | undefined) {
  stopSignals();
  // Event time stamps count from page load, like performance.now().
  const features = new FeatureExtractor(performance.now());
  const options = { capture: true, passive: true } as const;
  const onMove = (event: PointerEvent) => features.pointerMove({ t: event.timeStamp, x: event.clientX, y: event.clientY });
  // The extractor (pre-event code) marks "no item" with null.
  // eslint-disable-next-line unicorn/no-null
  const onOver = (event: PointerEvent) => features.pointerOver(event.timeStamp, itemAt(event.target)?.key ?? null);
  const onDown = (event: PointerEvent) => {
    const item = itemAt(event.target);
    const rect = item?.element.getBoundingClientRect();
    features.pointerDown({
      t: event.timeStamp,
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
      pressure: event.pressure,
      rect: rect && { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      // eslint-disable-next-line unicorn/no-null
      targetKey: item?.key ?? null,
    });
  };
  const onUp = (event: PointerEvent) => features.pointerUp(event.timeStamp);
  globalThis.addEventListener("pointermove", onMove, options);
  globalThis.addEventListener("pointerover", onOver, options);
  globalThis.addEventListener("pointerdown", onDown, options);
  globalThis.addEventListener("pointerup", onUp, options);
  extractor = features;
  detach = () => {
    globalThis.removeEventListener("pointermove", onMove, options);
    globalThis.removeEventListener("pointerover", onOver, options);
    globalThis.removeEventListener("pointerdown", onDown, options);
    globalThis.removeEventListener("pointerup", onUp, options);
  };
}

export function stopSignals() {
  detach?.();
  detach = undefined;
  extractor = undefined;
}

// The model features of the press that produced this click (pointer dynamics and time of day).
export function pressFeatures(timeStamp: number): Array<number> {
  return extractor ? [...selectModelFeatures(extractor.snapshot("open", timeStamp))] : [];
}
