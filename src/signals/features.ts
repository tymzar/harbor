import { ACTIONS } from '../cssnet/contract'

/**
 * Raw feature catalogue. Every feature is logged (debug drawer); only the
 * MODEL_FEATURES subset is fed to the network.
 */
export const POINTER_FEATURES = [
  'pressDuration',      // ms between pointerdown and pointerup
  'approachVelocity',   // mean px/ms over the 300ms before pointerdown
  'deceleration',       // speed(300..150ms before) - speed(last 150ms), px/ms
  'pathStraightness',   // chord / path length over the last 500ms (1 = straight)
  'tremor',             // RMS px around the centroid of the last 150ms
  'hoverDwell',         // ms the pointer was over the target before pressing
  'offsetFromCenter',   // distance from target centre / half-diagonal
  'targetSize',         // sqrt(w*h) px
  'timeSinceLastClick', // ms since previous pointerdown
  'burstCount2s',       // pointerdowns within the last 2s (rage clicks)
  'pointerType',        // mouse 0, pen 0.5, touch 1
  'pressure',           // PointerEvent.pressure
] as const

export const SCROLL_FEATURES = [
  'scrollVelocity',     // EMA |px/ms|
  'scrollReversals',    // direction changes within the last 5s
  'scrollDepth',        // 0..1
  'scrollIdleGap',      // ms since last scroll event
] as const

export const KEYBOARD_FEATURES = [
  'keysPerSec',         // keys in the last 5s / 5
  'backspaceRatio',     // backspaces / keys over the last 50 keys
  'interKeyStd',        // std-dev of inter-key intervals (last 20), ms
  'shortcutUse',        // ctrl/meta/alt combos this session
] as const

export const SESSION_FEATURES = [
  'sessionLength',      // s since session start
  'actionCount',        // actions this session
  'timeOnView',         // s since the current view was entered
  'revisitCount',       // times the current view has been entered
  'blurFreq',           // window blurs per minute
  'todSin',
  'todCos',
  'viewportClass',      // <640 = 0, <1024 = 0.5, else 1
] as const

export const JOURNEY_FEATURES = [0, 1, 2].flatMap((k) =>
  ACTIONS.map((a) => `last${k + 1}:${a}`),
)

export const RAW_FEATURE_NAMES: readonly string[] = [
  ...POINTER_FEATURES,
  ...SCROLL_FEATURES,
  ...KEYBOARD_FEATURES,
  ...SESSION_FEATURES,
  ...JOURNEY_FEATURES,
]

export const RAW_FEATURE_COUNT = RAW_FEATURE_NAMES.length // 52

export type Transform = 'none' | 'log1p'

export interface ModelFeatureSpec {
  name: string
  /** One-hot / categorical features skip running normalisation. */
  normalise: boolean
  /** Applied before normalisation (heavy-tailed ms values -> log1p). */
  transform: Transform
}

/**
 * The 15 features the model sees: the strongest pointer-dynamics signals
 * plus the last action as a one-hot over the 8 ACTIONS.
 * Change this constant to change the network input width.
 */
export const MODEL_FEATURES: readonly ModelFeatureSpec[] = [
  { name: 'pressDuration', normalise: true, transform: 'log1p' },
  { name: 'approachVelocity', normalise: true, transform: 'none' },
  { name: 'deceleration', normalise: true, transform: 'none' },
  { name: 'pathStraightness', normalise: true, transform: 'none' },
  { name: 'tremor', normalise: true, transform: 'log1p' },
  { name: 'hoverDwell', normalise: true, transform: 'log1p' },
  { name: 'burstCount2s', normalise: true, transform: 'none' },
  ...ACTIONS.map((a) => ({ name: `last1:${a}`, normalise: false, transform: 'none' as Transform })),
]

export const MODEL_INPUTS = MODEL_FEATURES.length // 15

const NAME_INDEX = new Map(RAW_FEATURE_NAMES.map((n, i) => [n, i]))
export const MODEL_FEATURE_INDEX = MODEL_FEATURES.map((f) => {
  const i = NAME_INDEX.get(f.name)
  if (i === undefined) throw new Error(`unknown model feature ${f.name}`)
  return i
})
export const NORMALISE_MASK = MODEL_FEATURES.map((f) => f.normalise)

/** Pick the model subset from a raw vector and apply per-feature transforms. */
export function selectModelFeatures(raw: Float32Array): Float32Array {
  const out = new Float32Array(MODEL_INPUTS)
  MODEL_FEATURES.forEach((f, j) => {
    const v = raw[MODEL_FEATURE_INDEX[j]]
    out[j] = f.transform === 'log1p' ? Math.log1p(Math.max(0, v)) : v
  })
  return out
}
