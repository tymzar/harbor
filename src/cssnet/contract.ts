/**
 * Shared contract between the app (src/app, src/model, src/signals) and the
 * CSS compute engine (src/cssnet). Both sides code against this file.
 * Change it only with a note in the commit message.
 */

/** The 8 learnable actions. Order is the model's output index. */
export const ACTIONS = [
  'nav-home', 'nav-explore', 'nav-library', 'search',
  'open-card', 'favorite', 'share', 'settings',
] as const
export type ActionId = (typeof ACTIONS)[number]

export interface NetShape { inputs: number; hidden: number; outputs: number }

/** Row-major: W1[h * inputs + i], W2[o * hidden + h]. */
export interface NetWeights {
  W1: Float32Array; b1: Float32Array
  W2: Float32Array; b2: Float32Array
}

/**
 * calc:      hidden + output layers as @property / calc() expressions
 * animation: forward pass done by the animation engine (paused animations,
 *            delay = input, linear() easing = activation, composition: add)
 *            plus whatever cross-layer bridge research found to work
 * hybrid:    animation hidden layer, calc() output layer
 */
export type CssNetMode = 'calc' | 'animation' | 'hybrid'

export interface CssNet {
  readonly shape: NetShape
  readonly mode: CssNetMode
  setWeights(w: NetWeights): void
  setInputs(x: Float32Array): void
  /** Softmax probabilities computed by CSS, read back from the DOM. */
  readOutputs(): Float32Array
  /** Hidden activations computed by CSS (for visuals). */
  readHidden(): Float32Array
  destroy(): void
}

/** Implemented in src/cssnet/index.ts */
export type MountCssNet = (host: HTMLElement, shape: NetShape, mode: CssNetMode) => CssNet
/** Pure-JS reference forward pass, used for parity checks. Implemented in src/cssnet/reference.ts */
export type JsForward = (shape: NetShape, w: NetWeights, x: Float32Array) => { hidden: Float32Array; out: Float32Array }

/**
 * Test hook the app exposes as window.__smartweb for Playwright.
 */
export interface SmartWebTestHook {
  /** Current CSS-computed output probabilities, ordered as ACTIONS. */
  cssOutputs(): number[]
  /** Same input through the JS reference with the same weights. */
  jsOutputs(): number[]
  /** Last feature vector fed to the model. */
  features(): number[]
  /** Current ranking shown in the UI, top first. */
  ranking(): ActionId[]
  /** Training examples seen so far, Markov top-1 accuracy, MLP top-1 accuracy (rolling 20). */
  stats(): { examples: number; markovAcc: number; mlpAcc: number; mode: CssNetMode }
  /** Click-to-pixel latencies in ms for the last N interactions. */
  latencies(): number[]
  setMode(mode: CssNetMode): void
  reset(): Promise<void>
}

/**
 * Stable test ids (data-testid):
 *   action-<ActionId>        every learnable control
 *   suggestion-list          the suggestion panel
 *   suggestion-item          each suggestion (data-action=<ActionId>)
 *   adaptive-grid            the container whose children get reordered
 *   pattern-layer            the generative background
 *   network-view             the live network visual (canvas; data-top, data-weights)
 *   network-output           one per output node (data-action), shows the CSS probability
 *   dot-grid                 the matrix3d lattice (src/cssnet/visual, no longer rendered by the app)
 *   debug-drawer, debug-toggle
 *   reset-model, export-model, import-model, replay-journey, mode-select
 */
