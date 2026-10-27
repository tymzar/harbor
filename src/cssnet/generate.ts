import type { NetShape, NetWeights } from './contract'

/**
 * Stylesheet generators. Two parameterisations:
 *  - "property" weights (no `w` passed): the stylesheet depends only on the NetShape; weights and
 *    biases are registered custom properties (`--cn-w1-j-i`, `--cn-b1-j`, ...) written by
 *    `weightsRule`, so a weight update is a custom-property write and the keyframes/calc never re-parse.
 *  - "literal" weights (`w` passed): weights and biases are baked into the stylesheet as number
 *    literals and nothing weight-related is registered. Cheaper per eval in the animation modes
 *    (Blink re-resolves var() inside keyframes on every sample, and inherited property maps are
 *    copied down the nested chain), dearer per setWeights. Measured in parity.check.mjs.
 * Inputs are always the custom properties `--cn-x{i}` set inline on the net's root element.
 *
 * Numeric conventions (verified in parity.check.mjs, see index.ts MODE_NOTES):
 *  - calc mode:      hidden_j = max(0, b1_j + sum_i w1_ji * x_i) in one calc() per neuron,
 *                    softmax = exp(z - max(z)) / sum (max-shifted so float32 exp never overflows).
 *  - animation modes: layer 1 samples x_i in [X_MIN, X_MAX] through a paused animation whose
 *                    delay is -(x_i - X_MIN) seconds on a (X_MAX - X_MIN)-second linear keyframe
 *                    from w*X_MIN to w*X_MAX, so the sampled value is exactly w*x_i. Inputs outside
 *                    the window saturate (fill-mode: both) as if clamped to it.
 *                    Layer 2 (animation mode only) samples h_j in [-H_MAX, H_MAX] with a
 *                    linear(0, 0 50%, 1) easing (relu) over a 2*H_MAX-second keyframe to w*H_MAX,
 *                    which yields w*max(0, min(H_MAX, h_j)); relu saturates at H_MAX.
 */
export const X_MIN = -4
export const X_MAX = 4
export const H_MAX = 16
/** em-bridge offset: font-size carrier = (h + H_OFF) px must stay in [0, 10000]. */
export const H_OFF = H_MAX

export const RELU_EASING = 'linear(0, 0 50%, 1)'

/** Custom property names. Shared across instances (their @property descriptors are identical). */
export const prop = {
  x: (i: number) => `--cn-x${i}`,
  w1: (j: number, i: number) => `--cn-w1-${j}-${i}`,
  b1: (j: number) => `--cn-b1-${j}`,
  w2: (k: number, j: number) => `--cn-w2-${k}-${j}`,
  b2: (k: number) => `--cn-b2-${k}`,
  /** hidden activation per neuron (calc: relu'd; hybrid: pre-activation, see `a`). */
  h: (j: number) => `--cn-h${j}`,
  /** relu(hidden) per neuron (hybrid). */
  a: (j: number) => `--cn-a${j}`,
  /** animation mode: single inherited hidden carrier and its relu. */
  hAnim: '--cn-h',
  aAnim: '--cn-a',
  /** animation mode logits accumulated through the nested chain. */
  o: (k: number) => `--cn-o${k}`,
  z: (k: number) => `--cn-z${k}`,
  e: (k: number) => `--cn-e${k}`,
  p: (k: number) => `--cn-p${k}`,
  is: (k: number) => `--cn-is${k}`,
  zmax: '--cn-zmax',
  esum: '--cn-esum',
  pmax: '--cn-pmax',
} as const

/** Float32-safe CSS number literal (9 significant digits round-trips a float32). */
export function num(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  return Number(n.toPrecision(9)).toString()
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

export function registration(name: string, inherits = true, initial = 0): string {
  return `@property ${name}{syntax:'<number>';inherits:${inherits};initial-value:${initial}}`
}

/** Parameter accessors: literal numbers when `w` is given, var() of the registered property otherwise. */
function params(shape: NetShape, w?: NetWeights) {
  const { inputs: I, hidden: H } = shape
  return {
    w1: (j: number, i: number) => (w ? num(w.W1[j * I + i]) : `var(${prop.w1(j, i)})`),
    b1: (j: number) => (w ? num(w.b1[j]) : `var(${prop.b1(j)})`),
    w2: (k: number, j: number) => (w ? num(w.W2[k * H + j]) : `var(${prop.w2(k, j)})`),
    b2: (k: number) => (w ? num(w.b2[k]) : `var(${prop.b2(k)})`),
    /** w * c as a literal or a calc on the property. */
    w1x: (j: number, i: number, c: number) => (w ? num(w.W1[j * I + i] * c) : `calc(var(${prop.w1(j, i)}) * ${c})`),
    w2x: (k: number, j: number, c: number) => (w ? num(w.W2[k * H + j] * c) : `calc(var(${prop.w2(k, j)}) * ${c})`),
  }
}

/** @property rules for inputs and, unless literal, weights and biases. */
export function parameterRegistrations(shape: NetShape, literal = false): string[] {
  const { inputs: I, hidden: H, outputs: O } = shape
  const out: string[] = []
  for (const i of range(I)) out.push(registration(prop.x(i)))
  if (literal) return out
  for (const j of range(H)) {
    out.push(registration(prop.b1(j)))
    for (const i of range(I)) out.push(registration(prop.w1(j, i)))
  }
  for (const k of range(O)) {
    out.push(registration(prop.b2(k)))
    for (const j of range(H)) out.push(registration(prop.w2(k, j)))
  }
  return out
}

/** @property rules for the softmax block and argmax flags. */
export function softmaxRegistrations(shape: NetShape): string[] {
  const out: string[] = []
  for (const k of range(shape.outputs)) {
    out.push(registration(prop.z(k)), registration(prop.e(k)), registration(prop.p(k)), registration(prop.is(k)))
  }
  out.push(registration(prop.zmax), registration(prop.esum, true, 1), registration(prop.pmax))
  return out
}

/**
 * Numerically stable softmax + pure-CSS argmax flags as declarations.
 * `logit(k)` is the CSS expression (usually a var()) holding logit k.
 */
export function softmaxDeclarations(shape: NetShape, logit: (k: number) => string): string[] {
  const O = shape.outputs
  const d: string[] = []
  for (const k of range(O)) d.push(`${prop.z(k)}:calc(${logit(k)})`)
  d.push(`${prop.zmax}:max(${range(O).map((k) => `var(${prop.z(k)})`).join(',')})`)
  for (const k of range(O)) d.push(`${prop.e(k)}:exp(var(${prop.z(k)}) - var(${prop.zmax}))`)
  d.push(`${prop.esum}:calc(${range(O).map((k) => `var(${prop.e(k)})`).join(' + ')})`)
  for (const k of range(O)) d.push(`${prop.p(k)}:calc(var(${prop.e(k)}) / var(${prop.esum}))`)
  d.push(`${prop.pmax}:max(${range(O).map((k) => `var(${prop.p(k)})`).join(',')})`)
  for (const k of range(O)) d.push(`${prop.is(k)}:calc(1 - clamp(0, (var(${prop.pmax}) - var(${prop.p(k)})) * 1e6, 1))`)
  return d
}

/** The rule carrying the current weights as custom properties. Applied to the root element via class `cls`. */
export function weightsRule(shape: NetShape, cls: string, w: NetWeights): string {
  const { inputs: I, hidden: H, outputs: O } = shape
  const d: string[] = []
  for (const j of range(H)) {
    d.push(`${prop.b1(j)}:${num(w.b1[j])}`)
    for (const i of range(I)) d.push(`${prop.w1(j, i)}:${num(w.W1[j * I + i])}`)
  }
  for (const k of range(O)) {
    d.push(`${prop.b2(k)}:${num(w.b2[k])}`)
    for (const j of range(H)) d.push(`${prop.w2(k, j)}:${num(w.W2[k * H + j])}`)
  }
  return `.${cls}{${d.join(';')}}`
}

/** Inline style text setting the inputs on the root element. */
export function inputsStyle(shape: NetShape, x: ArrayLike<number>): string {
  return range(shape.inputs).map((i) => `${prop.x(i)}:${num(x[i] ?? 0)}`).join(';')
}

const ROOT_STYLE = 'display:block;position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;contain:strict;font-size:16px;line-height:16px'

/* ------------------------------------------------------------------ calc */

/** Mode calc: everything on one element (class `${cls}-root`). */
export function calcStylesheet(shape: NetShape, cls: string, w?: NetWeights): string {
  const { inputs: I, hidden: H } = shape
  const P = params(shape, w)
  const regs = [...parameterRegistrations(shape, !!w), ...range(H).map((j) => registration(prop.h(j))), ...softmaxRegistrations(shape)]
  const d: string[] = []
  for (const j of range(H)) {
    const terms = [P.b1(j), ...range(I).map((i) => `${P.w1(j, i)} * var(${prop.x(i)})`)]
    d.push(`${prop.h(j)}:max(0, ${terms.join(' + ')})`)
  }
  d.push(...softmaxDeclarations(shape, (k) => [P.b2(k), ...range(H).map((j) => `${P.w2(k, j)} * var(${prop.h(j)})`)].join(' + ')))
  return `${regs.join('\n')}\n.${cls}-root{${ROOT_STYLE};${d.join(';')}}`
}

/* ---------------------------------------------------------------- hybrid */

function layer1Animation(shape: NetShape, cls: string, hiddenProp: (j: number) => string, w?: NetWeights): { keyframes: string[]; delays: string } {
  const { inputs: I, hidden: H } = shape
  const P = params(shape, w)
  const keyframes: string[] = []
  for (const j of range(H)) for (const i of range(I)) {
    keyframes.push(`@keyframes ${cls}-h${j}-${i}{from{${hiddenProp(j)}:${P.w1x(j, i, X_MIN)}}to{${hiddenProp(j)}:${P.w1x(j, i, X_MAX)}}}`)
  }
  const delays = range(I).map((i) => `calc((var(${prop.x(i)}) - ${X_MIN}) * -1s)`).join(',')
  return { keyframes, delays }
}

const ANIM_COMMON = `animation-duration:${X_MAX - X_MIN}s;animation-timing-function:linear;animation-play-state:paused;animation-fill-mode:both;animation-composition:add`

/**
 * Mode hybrid: all H*I hidden animations on the root element (distinct --cn-h{j}),
 * relu + output layer + softmax as calc() on the same element.
 */
export function hybridStylesheet(shape: NetShape, cls: string, w?: NetWeights): string {
  const { inputs: I, hidden: H } = shape
  const P = params(shape, w)
  const regs = [...parameterRegistrations(shape, !!w), ...range(H).flatMap((j) => [registration(prop.h(j)), registration(prop.a(j))]), ...softmaxRegistrations(shape)]
  const { keyframes, delays } = layer1Animation(shape, cls, prop.h, w)
  const d: string[] = []
  for (const j of range(H)) d.push(`${prop.h(j)}:${P.b1(j)}`)
  d.push(ANIM_COMMON)
  d.push(`animation-name:${range(H).flatMap((j) => range(I).map((i) => `${cls}-h${j}-${i}`)).join(',')}`)
  d.push(`animation-delay:${range(H).map(() => delays).join(',')}`)
  for (const j of range(H)) d.push(`${prop.a(j)}:max(0, var(${prop.h(j)}))`)
  d.push(...softmaxDeclarations(shape, (k) => [P.b2(k), ...range(H).map((j) => `${P.w2(k, j)} * var(${prop.a(j)})`)].join(' + ')))
  return `${regs.join('\n')}\n${keyframes.join('\n')}\n.${cls}-root{${ROOT_STYLE};${d.join(';')}}`
}

/* ------------------------------------------------------------- animation */

/**
 * Mode animation: nested chain root > n0 > f0 > p0 > n1 > f1 > p1 > ... > p{H-1} > out.
 *  n_j: I input animations on inherited --cn-h (base = b1_j)            [animation engine]
 *  f_j: font-size = (h + H_OFF)px (em bridge; launders the animation taint), --cn-a = relu(h) for readback
 *  p_j: O animations on inherited --cn-o{k}, delay from 1em, relu easing, composition add
 *       onto the value inherited from p_{j-1} -> accumulates b2_k + sum_j w2_kj relu(h_j)   [animation engine]
 *  out: softmax division in calc() (the only arithmetic the animation engine cannot express).
 */
export function animationStylesheet(shape: NetShape, cls: string, w?: NetWeights): string {
  const { inputs: I, hidden: H, outputs: O } = shape
  const P = params(shape, w)
  const regs = [...parameterRegistrations(shape, !!w), registration(prop.hAnim), registration(prop.aAnim), ...range(O).map((k) => registration(prop.o(k))), ...softmaxRegistrations(shape)]
  const { keyframes, delays } = layer1Animation(shape, cls, () => prop.hAnim, w)
  for (const k of range(O)) for (const j of range(H)) {
    keyframes.push(`@keyframes ${cls}-o${k}-${j}{from{${prop.o(k)}:0}to{${prop.o(k)}:${P.w2x(k, j, H_MAX)}}}`)
  }
  const rules: string[] = []
  rules.push(`.${cls}-root{${ROOT_STYLE};${range(O).map((k) => `${prop.o(k)}:${P.b2(k)}`).join(';')}}`)
  rules.push(`.${cls}-n{display:block;${ANIM_COMMON};animation-delay:${delays}}`)
  for (const j of range(H)) rules.push(`.${cls}-n${j}{${prop.hAnim}:${P.b1(j)};animation-name:${range(I).map((i) => `${cls}-h${j}-${i}`).join(',')}}`)
  rules.push(`.${cls}-f{display:block;font-size:calc((var(${prop.hAnim}) + ${H_OFF}) * 1px);${prop.aAnim}:max(0, var(${prop.hAnim}))}`)
  rules.push(`.${cls}-p{display:block;animation-duration:${2 * H_MAX}s;animation-timing-function:${RELU_EASING};animation-play-state:paused;animation-fill-mode:both;animation-composition:add;animation-delay:calc(((1em / 1px) - ${H_OFF} + ${H_MAX}) * -1s)}`)
  for (const j of range(H)) rules.push(`.${cls}-p${j}{animation-name:${range(O).map((k) => `${cls}-o${k}-${j}`).join(',')}}`)
  rules.push(`.${cls}-out{display:block;${softmaxDeclarations(shape, (k) => `var(${prop.o(k)})`).join(';')}}`)
  return `${regs.join('\n')}\n${keyframes.join('\n')}\n${rules.join('\n')}`
}

/** Builds the nested DOM for animation mode under `root`; returns the hidden readers (f_j) and the out element. */
export function buildAnimationDom(doc: Document, shape: NetShape, cls: string, root: HTMLElement): { f: HTMLElement[]; n: HTMLElement[]; out: HTMLElement } {
  let parent: HTMLElement = root
  const f: HTMLElement[] = []
  const n: HTMLElement[] = []
  for (let j = 0; j < shape.hidden; j++) {
    const nj = doc.createElement('div'); nj.className = `${cls}-n ${cls}-n${j}`
    const fj = doc.createElement('div'); fj.className = `${cls}-f`
    const pj = doc.createElement('div'); pj.className = `${cls}-p ${cls}-p${j}`
    nj.appendChild(fj); fj.appendChild(pj); parent.appendChild(nj)
    parent = pj; f.push(fj); n.push(nj)
  }
  const out = doc.createElement('div'); out.className = `${cls}-out`
  parent.appendChild(out)
  return { f, n, out }
}
