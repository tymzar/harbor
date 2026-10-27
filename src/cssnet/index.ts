import type { CssNet, CssNetMode, MountCssNet, NetShape, NetWeights } from './contract'
import { buildNodes, nodeStylesheet } from './nodes'
import { animationStylesheet, buildAnimationDom, calcStylesheet, hybridStylesheet, inputsStyle, prop, weightsRule, X_MAX, X_MIN, H_MAX } from './generate'
import { jsForward, zeroWeights } from './reference'

export * from './reference'
export * from './generate'

/**
 * What each mode computes where. Everything "CSS" below is synchronous: a read
 * right after setInputs() forces the style recalc that *is* the forward pass.
 */
export const MODE_NOTES: Record<CssNetMode, string> = {
  calc:
    'CSS calc(): hidden = max(0, b + W·x), logits, max-shifted exp()/sum softmax and argmax flags on one element. ' +
    'JS only writes inputs/weights as custom properties and reads results. Precision: Chrome calc is float32 ' +
    '(measured max |Δp| 5.5e-6 vs JS). Measured 388 us/eval 15-16-8 (217 us with literalWeights), setWeights ~0.5 ms.',
  hybrid:
    'Hidden layer in the CSS animation engine: one paused animation per weight, animation-delay = -(x - X_MIN)s selects the ' +
    'sample, keyframes w·X_MIN -> w·X_MAX, animation-composition: add sums them. relu, output layer and softmax are calc() ' +
    `on the same element. Inputs saturate outside [${X_MIN}, ${X_MAX}]. Measured max |Δp| 4.5e-6; 796 us/eval, setWeights 1.6 ms.`,
  animation:
    'Both weighted layers and the relu in the CSS animation engine, no JS between layers: hidden neurons as above; the ' +
    'em bridge (font-size: (h + 16)px on a child, 1em/1px in the grandchild\'s animation-delay) launders the animation taint; ' +
    'output animations use linear(0, 0 50%, 1) easing (relu) and composition: add onto the value inherited from the previous ' +
    `neuron so the nested chain accumulates the logits. Only the softmax division is calc(). relu saturates at h = ${H_MAX}. ` +
    'Synchronous (no frame latency). Measured max |Δp| 4.5e-6; 1152 us/eval, setWeights 2.3 ms (keyframes regenerate).',
}

/** Reads registered <number> custom properties from one computed style (Typed OM when available: full double precision). */
function readNumbers(el: Element, names: readonly string[], out: Float32Array, offset = 0): void {
  const typed = (el as Element & { computedStyleMap?: () => StylePropertyMapReadOnly }).computedStyleMap
  if (typeof typed === 'function') {
    const m = typed.call(el)
    for (let i = 0; i < names.length; i++) {
      const v = m.get(names[i]) as CSSUnitValue | undefined
      out[offset + i] = v && typeof v.value === 'number' ? v.value : NaN
    }
    return
  }
  const cs = getComputedStyle(el)
  for (let i = 0; i < names.length; i++) out[offset + i] = parseFloat(cs.getPropertyValue(names[i]))
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

export interface MountOptions {
  /**
   * true: weights and biases are baked into the stylesheet as literals (nothing weight-related is
   * registered as a custom property) and setWeights() regenerates that stylesheet.
   * false: the stylesheet is static per shape; weights are registered custom properties written
   * by setWeights(). Default: true for the animation modes (var() inside keyframes and inherited
   * property maps make the property form ~15-45% slower per eval), false for calc (weights as
   * custom properties, ~20% slower per eval than literal but setWeights is one rule rewrite).
   * Both forms are measured by parity.check.mjs.
   */
  literalWeights?: boolean
  /**
   * Verify at mount that the engine computes (with zero weights every output must read 1/outputs).
   * Throws when the environment does not compute registered custom properties (e.g. jsdom), so a
   * caller can fall back to JS. Default true.
   */
  probe?: boolean
  /**
   * Render visible CSS-driven neurons inside the computing elements (see nodes.ts). The host
   * supplies positions and labels via --nv-* custom properties. Default false.
   */
  nodes?: boolean
}

let seq = 0

export const mountCssNet: MountCssNet & ((host: HTMLElement, shape: NetShape, mode: CssNetMode, opts?: MountOptions) => CssNet) =
  (host: HTMLElement, shape: NetShape, mode: CssNetMode, opts: MountOptions = {}): CssNet => {
  const literal = opts.literalWeights ?? mode !== 'calc'
  const doc = host.ownerDocument
  const cls = `cn${++seq}`
  const wcls = `${cls}-w`
  const mainSheet = (w?: NetWeights) => mode === 'calc' ? calcStylesheet(shape, cls, w) : mode === 'hybrid' ? hybridStylesheet(shape, cls, w) : animationStylesheet(shape, cls, w)

  const sheet = doc.createElement('style')
  sheet.dataset.cssnet = `${cls}-${mode}`
  sheet.textContent = mainSheet(literal ? zeroWeights(shape) : undefined)
  doc.head.appendChild(sheet)
  let weightSheet: HTMLStyleElement | null = null
  if (!literal) {
    weightSheet = doc.createElement('style')
    weightSheet.dataset.cssnet = `${cls}-weights`
    weightSheet.textContent = weightsRule(shape, wcls, zeroWeights(shape))
    doc.head.appendChild(weightSheet)
  }

  const root = doc.createElement('div')
  root.className = literal ? `${cls}-root` : `${cls}-root ${wcls}`
  root.dataset.cssnet = mode
  root.setAttribute('aria-hidden', 'true')

  let outEl: HTMLElement = root
  let fEls: HTMLElement[] | null = null
  let hiddenReaders: { el: HTMLElement; names: string[] }[]
  const pNames = range(shape.outputs).map(prop.p)
  if (mode === 'animation') {
    const dom = buildAnimationDom(doc, shape, cls, root)
    outEl = dom.out
    fEls = dom.f
    hiddenReaders = dom.f.map((el) => ({ el, names: [prop.aAnim] }))
  } else {
    const names = range(shape.hidden).map(mode === 'calc' ? prop.h : prop.a)
    hiddenReaders = [{ el: root, names }]
  }
  let nodeSheet: HTMLStyleElement | null = null
  if (opts.nodes) {
    nodeSheet = doc.createElement('style')
    nodeSheet.dataset.cssnet = `${cls}-nodes`
    nodeSheet.textContent = nodeStylesheet(shape, cls, mode)
    doc.head.appendChild(nodeSheet)
    buildNodes(doc, shape, cls, root, outEl, fEls)
  }
  root.style.cssText = inputsStyle(shape, new Float32Array(shape.inputs))
  host.appendChild(root)

  if (opts.probe ?? true) {
    const p = new Float32Array(shape.outputs)
    readNumbers(outEl, pNames, p)
    const expected = 1 / shape.outputs
    const ok = Array.from(p).every((v) => Number.isFinite(v) && Math.abs(v - expected) < 1e-4)
    if (!ok) {
      root.remove(); sheet.remove(); weightSheet?.remove(); nodeSheet?.remove()
      throw new Error(`cssnet: CSS compute unavailable in this environment (probe read [${Array.from(p).join(', ')}], expected ${expected} each)`)
    }
  }

  let destroyed = false
  let mask: Float32Array | null = null
  return {
    shape,
    mode,
    setWeights(w: NetWeights) {
      if (destroyed) return
      if (weightSheet) weightSheet.textContent = weightsRule(shape, wcls, w)
      else sheet.textContent = mainSheet(w)
    },
    setInputs(x: Float32Array, m?: Float32Array) {
      if (destroyed) return
      if (m) mask = m
      root.style.cssText = inputsStyle(shape, x, mask)
    },
    readOutputs() {
      const out = new Float32Array(shape.outputs)
      if (!destroyed) readNumbers(outEl, pNames, out)
      return out
    },
    readHidden() {
      const out = new Float32Array(shape.hidden)
      if (destroyed) return out
      let off = 0
      for (const r of hiddenReaders) { readNumbers(r.el, r.names, out, off); off += r.names.length }
      return out
    },
    destroy() {
      destroyed = true
      root.remove(); sheet.remove(); weightSheet?.remove(); nodeSheet?.remove()
    },
  }
}

export default mountCssNet

/** Pure-CSS argmax flags (--cn-is{k}, 1 for the argmax else 0) read from the net's output element. */
export function readArgmaxFlags(net: CssNet, host: HTMLElement): Float32Array {
  const out = new Float32Array(net.shape.outputs)
  const el = host.querySelector<HTMLElement>(`[data-cssnet="${net.mode}"]`)
  const target = net.mode === 'animation' ? el?.querySelector<HTMLElement>('[class$="-out"]') : el
  if (target) readNumbers(target, range(net.shape.outputs).map(prop.is), out)
  return out
}

export { jsForward as reference }
