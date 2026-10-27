import type { CssNetMode, NetShape } from './contract'
import { prop, registration } from './generate'

/**
 * Visible, CSS-driven neurons.
 *
 * Each node element is placed INSIDE the element whose styles compute its value, so the node
 * reads the network's own registered (inherited) custom properties. Its size, colour, glow and
 * label are calc() expressions over those values: the stylesheet computes the activation and
 * paints the node in the same style pass. No JavaScript reads a value to draw a node.
 *
 *   input i   child of the root          reads --cn-x{i}
 *   hidden j  calc: child of root        reads --cn-h{j}          (relu already applied)
 *             hybrid: child of root      reads --cn-a{j}
 *             animation: child of f_j    reads --cn-a             (the em-bridge element)
 *   output k  calc/hybrid: child of root reads --cn-p{k}, --cn-pmax, --cn-is{k}
 *             animation: child of out    same names
 *
 * Positions and names come from the host as unregistered inherited custom properties:
 *   --nv-in-x, --nv-h-x, --nv-o-x, --nv-in-y{i}, --nv-h-y{j}, --nv-o-y{k}  (lengths)
 *   --nv-label{k}                                                          (a <string>)
 *
 * The percentage label is a CSS counter fed by a registered <integer> property, so even the
 * printed number is computed by the stylesheet.
 *
 * Display timing: values are computed immediately; transition-delay staggers the layers
 * (hidden after the first hop, outputs after the second) to match the illustrated signal wave.
 */

export const NODE_TIMING = { hiddenDelayMs: 520, outputDelayMs: 1150, durationMs: 380 }

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

export function nodeStylesheet(shape: NetShape, cls: string, mode: CssNetMode): string {
  const { inputs: I, hidden: H, outputs: O } = shape
  const t = NODE_TIMING
  const ease = 'cubic-bezier(.22,.61,.36,1)'
  const tr = (delay: number) => `transition:top 420ms ${ease},opacity 300ms ${ease},width ${t.durationMs}ms ${ease} ${delay}ms,height ${t.durationMs}ms ${ease} ${delay}ms,background-color ${t.durationMs}ms ${ease} ${delay}ms,box-shadow ${t.durationMs}ms ${ease} ${delay}ms,color ${t.durationMs}ms ${ease} ${delay}ms`
  const r: string[] = [registration('--cn-pct', true, 0).replace("'<number>'", "'<integer>'")]
  // The root normally clips (contain:strict, overflow:hidden). With nodes it must paint them.
  r.push(`.${cls}-root.${cls}-visible{overflow:visible;contain:layout style}`)
  r.push(`.${cls}-node{position:absolute;display:block;border-radius:9999px;translate:-50% -50%;pointer-events:none;font-size:12px;line-height:16px;animation:none}`)

  // Inputs: magnitude of the normalised feature (|x| / 2.5, capped).
  for (const i of range(I)) {
    r.push(`.${cls}-in${i}{--nv-v:min(1, max(var(${prop.x(i)}), calc(-1 * var(${prop.x(i)}))) / 2.5);left:var(--nv-in-x);top:var(--nv-in-y${i})}`)
  }
  r.push(`.${cls}-in{width:calc(5px + 3.5px * var(--nv-v));height:calc(5px + 3.5px * var(--nv-v));background-color:color-mix(in oklab, var(--foreground) calc(14% + 66% * var(--nv-v)), transparent);${tr(0)}}`)

  // Hidden: relu activation squashed to [0,1): a / (a + 1).
  for (const j of range(H)) {
    const v = mode === 'animation' ? `var(${prop.aAnim})` : mode === 'hybrid' ? `var(${prop.a(j)})` : `var(${prop.h(j)})`
    r.push(`.${cls}-hn${j}{--nv-a:${v};top:var(--nv-h-y${j})}`)
  }
  r.push(`.${cls}-hn{--nv-v:calc(var(--nv-a) / (var(--nv-a) + 1));left:var(--nv-h-x);width:calc(5px + 8px * var(--nv-v));height:calc(5px + 8px * var(--nv-v));background-color:color-mix(in oklab, var(--accent) calc(100% * min(1, 0.12 + 1.2 * var(--nv-v))), color-mix(in oklab, var(--foreground) 12%, transparent));box-shadow:0 0 calc(30px * var(--nv-v)) calc(4px * var(--nv-v)) color-mix(in oklab, var(--accent) calc(70% * var(--nv-v)), transparent);${tr(t.hiddenDelayMs)}}`)

  // Outputs: probability relative to the max, and the pure-CSS argmax flag for the winner.
  for (const k of range(O)) {
    r.push(`.${cls}-on${k}{opacity:var(${prop.m(k)});--nv-p:var(${prop.p(k)});--nv-top:var(${prop.is(k)});--cn-pct:calc(var(${prop.p(k)}) * 100);top:var(--nv-o-y${k})}`)
    r.push(`.${cls}-on${k}>.${cls}-label::before{content:var(--nv-label${k})}`)
  }
  r.push(`.${cls}-on{--nv-v:calc(var(--nv-p) / max(var(${prop.pmax}), 0.000001));left:var(--nv-o-x);width:calc(7px + 9px * var(--nv-v));height:calc(7px + 9px * var(--nv-v));background-color:color-mix(in oklab, var(--accent) calc(18% + 60% * var(--nv-v) + 22% * var(--nv-top)), transparent);box-shadow:0 0 calc(28px * var(--nv-top)) calc(5px * var(--nv-top)) color-mix(in oklab, var(--accent) 60%, transparent);${tr(t.outputDelayMs)}}`)
  r.push(`.${cls}-label{position:absolute;left:calc(100% + 10px);top:50%;translate:0 -50%;width:150px;display:flex;gap:8px;white-space:nowrap;counter-reset:cnpct var(--cn-pct);font-weight:calc(400 + 100 * var(--nv-top));color:color-mix(in oklab, var(--foreground) calc(58% + 42% * var(--nv-top)), transparent);${tr(t.outputDelayMs)}}`)
  r.push(`.${cls}-label::before{overflow:hidden;text-overflow:ellipsis}`)
  r.push(`.${cls}-label::after{content:counter(cnpct) "%";margin-left:auto;font-variant-numeric:tabular-nums;opacity:.75}`)
  return r.join('\n')
}

export interface NodeElements { inputs: HTMLElement[]; hidden: HTMLElement[]; outputs: HTMLElement[] }

/** Creates node elements inside the computing elements. `hiddenParents` are the f_j elements in animation mode. */
export function buildNodes(doc: Document, shape: NetShape, cls: string, root: HTMLElement, outEl: HTMLElement, hiddenParents: HTMLElement[] | null, onlyOutputs?: number[]): NodeElements {
  root.classList.add(`${cls}-visible`)
  const mk = (c: string, attrs: Record<string, string>) => {
    const el = doc.createElement('div')
    el.className = c
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    return el
  }
  const inputs = range(shape.inputs).map((i) => { const el = mk(`${cls}-node ${cls}-in ${cls}-in${i}`, { 'data-node': 'input', 'data-i': String(i) }); root.appendChild(el); return el })
  const hidden = range(shape.hidden).map((j) => {
    const el = mk(`${cls}-node ${cls}-hn ${cls}-hn${j}`, { 'data-node': 'hidden', 'data-j': String(j) })
    ;(hiddenParents ? hiddenParents[j] : root).appendChild(el)
    return el
  })
  const outputs = (onlyOutputs ?? range(shape.outputs)).map((k) => {
    const el = mk(`${cls}-node ${cls}-on ${cls}-on${k}`, { 'data-node': 'output', 'data-k': String(k) })
    el.appendChild(mk(`${cls}-label`, {}))
    outEl.appendChild(el)
    return el
  })
  return { inputs, hidden, outputs }
}
