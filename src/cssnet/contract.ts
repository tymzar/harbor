/**
 * Shared contract between the app (src/app, src/model, src/signals) and the
 * CSS compute engine (src/cssnet). Both sides code against this file.
 * Change it only with a note in the commit message.
 */

/**
 * Interaction kinds the signal extractor logs (navigation + what you did to a card).
 * Not the model's output space: the model ranks CARDS.
 */
export const ACTIONS = ['nav-home', 'nav-explore', 'nav-library', 'open', 'favorite', 'share', 'search', 'query'] as const
export type ActionId = (typeof ACTIONS)[number]
/**
 * What you did to a card. search = picked it from the search palette (explicit intent);
 * query = typed a search it topped but closed without picking (weak interest).
 */
/** 'unfavorite' is the heart pressed while on: shares the favorite button (and its pointer features) and slightly lowers the card. */
export type Verb = 'open' | 'favorite' | 'unfavorite' | 'share' | 'search' | 'query'

/** Categories: each is a scope whose cards are ranked independently. */
export const CATEGORIES = ['home', 'explore', 'library'] as const
export type Category = (typeof CATEGORIES)[number]

/** The model's outputs: one per card, 6 per category. Order is the output index. */
export const CARDS = [
  { id: 'briefing', category: 'home' }, { id: 'drafts', category: 'home' }, { id: 'team', category: 'home' },
  { id: 'calendar', category: 'home' }, { id: 'inbox', category: 'home' }, { id: 'notes', category: 'home' },
  { id: 'basalt', category: 'explore' }, { id: 'nightsky', category: 'explore' }, { id: 'moss', category: 'explore' },
  { id: 'citywalks', category: 'explore' }, { id: 'tidepools', category: 'explore' }, { id: 'desert', category: 'explore' },
  { id: 'fieldnotes', category: 'library' }, { id: 'typography', category: 'library' }, { id: 'recipes', category: 'library' },
  { id: 'reading', category: 'library' }, { id: 'maps', category: 'library' }, { id: 'archive', category: 'library' },
] as const satisfies readonly { id: string; category: Category }[]
export type CardId = (typeof CARDS)[number]['id']
export const CARD_IDS: readonly CardId[] = CARDS.map((c) => c.id)
export const cardsOf = (c: Category): CardId[] => CARDS.filter((k) => k.category === c).map((k) => k.id)
/** Output mask for a category: 1 for its cards, 0 elsewhere. */
export function categoryMask(c: Category): Float32Array {
  return Float32Array.from(CARDS, (k) => (k.category === c ? 1 : 0))
}

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
  /** Inputs, plus an optional output mask (kept until replaced): masked outputs leave the softmax. */
  setInputs(x: Float32Array, mask?: Float32Array): void
  /** Softmax probabilities computed by CSS (over unmasked outputs), read back from the DOM. */
  readOutputs(): Float32Array
  /** Hidden activations computed by CSS (for visuals). */
  readHidden(): Float32Array
  destroy(): void
}

/** Implemented in src/cssnet/index.ts */
export type MountCssNet = (host: HTMLElement, shape: NetShape, mode: CssNetMode) => CssNet
/** Pure-JS reference forward pass, used for parity checks. Implemented in src/cssnet/reference.ts */
export type JsForward = (shape: NetShape, w: NetWeights, x: Float32Array, mask?: ArrayLike<number> | null) => { hidden: Float32Array; out: Float32Array }

/**
 * Test hook the app exposes as window.__smartweb for Playwright.
 */
export interface SmartWebTestHook {
  /** Current CSS-computed output probabilities (18, masked to the current category). */
  cssOutputs(): number[]
  /** Same input and mask through the JS reference with the same weights. */
  jsOutputs(): number[]
  /** Last feature vector fed to the model. */
  features(): number[]
  /** Current category. */
  category(): Category
  /** Card order shown for a category (defaults to the current one), first = top. */
  order(c?: Category): CardId[]
  /** examples; rolling hit rate (last 20: engaged card was in that predictor's top 3) for affinity and MLP; MLP blend weight. */
  stats(): { examples: number; affinityAcc: number; mlpAcc: number; alpha: number; mode: CssNetMode }
  /** Click-to-pixel latencies in ms for the last N interactions. */
  latencies(): number[]
  setMode(mode: CssNetMode): void
  reset(): Promise<void>
}

/**
 * Stable test ids (data-testid):
 *   nav-<Category>                 category tabs
 *   adaptive-grid                  the current category's cards (children carry data-card)
 *   card-<CardId>                  a card; inside it: card-<CardId>-open, -favorite, -share
 *   pattern-layer                  the generative background (visible on the Model page only)
 *   network-view, cssnet-host      the live network; CSS nodes carry data-node / data-k
 *   debug-drawer
 *   Model page: debug-toggle, reset-model, export-model, export-link, import-model, replay-journey, mode-select
 * The app root carries data-app-ready once the model has loaded.
 */
