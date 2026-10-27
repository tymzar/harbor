// Tiny calc()-mode net generator shared by r2-* experiments.
// Produces: CSS text (registered @property neurons + calc chain), a JS reference, random weights.
// Shape: inputs -> hidden (relu) -> outputs (softmax)

export function rand(seed) { // mulberry32
  let a = seed >>> 0
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export function makeWeights(shape, seed = 1) {
  const r = rand(seed)
  const g = () => (r() * 2 - 1)
  return {
    W1: Float32Array.from({ length: shape.hidden * shape.inputs }, () => g() * 0.8),
    b1: Float32Array.from({ length: shape.hidden }, () => g() * 0.2),
    W2: Float32Array.from({ length: shape.outputs * shape.hidden }, () => g() * 0.8),
    b2: Float32Array.from({ length: shape.outputs }, () => g() * 0.2),
  }
}

export function jsForward(shape, w, x) {
  const hidden = new Float32Array(shape.hidden)
  for (let h = 0; h < shape.hidden; h++) {
    let s = w.b1[h]
    for (let i = 0; i < shape.inputs; i++) s += w.W1[h * shape.inputs + i] * x[i]
    hidden[h] = Math.max(0, s)
  }
  const z = new Float32Array(shape.outputs)
  for (let o = 0; o < shape.outputs; o++) {
    let s = w.b2[o]
    for (let h = 0; h < shape.hidden; h++) s += w.W2[o * shape.hidden + h] * hidden[h]
    z[o] = s
  }
  const m = Math.max(...z)
  const e = z.map(v => Math.exp(v - m))
  const sum = e.reduce((a, b) => a + b, 0)
  return { hidden, z, out: e.map(v => v / sum) }
}

const f = n => Number(n).toPrecision(7)

/** CSS for the net. Inputs are --x0..--xN set on the host element (inline style). */
export function netCss(shape, w, { scope = '.net' } = {}) {
  const props = []
  const decl = []
  for (let i = 0; i < shape.inputs; i++) props.push(`@property --x${i}{syntax:'<number>';inherits:true;initial-value:0}`)
  for (let h = 0; h < shape.hidden; h++) {
    props.push(`@property --h${h}{syntax:'<number>';inherits:true;initial-value:0}`)
    const terms = [f(w.b1[h])]
    for (let i = 0; i < shape.inputs; i++) terms.push(`${f(w.W1[h * shape.inputs + i])}*var(--x${i})`)
    decl.push(`--h${h}:max(0, ${terms.join(' + ')});`)
  }
  for (let o = 0; o < shape.outputs; o++) {
    props.push(`@property --z${o}{syntax:'<number>';inherits:true;initial-value:0}`)
    props.push(`@property --e${o}{syntax:'<number>';inherits:true;initial-value:0}`)
    props.push(`@property --p${o}{syntax:'<number>';inherits:true;initial-value:0}`)
    const terms = [f(w.b2[o])]
    for (let h = 0; h < shape.hidden; h++) terms.push(`${f(w.W2[o * shape.hidden + h])}*var(--h${h})`)
    decl.push(`--z${o}:calc(${terms.join(' + ')});`)
    decl.push(`--e${o}:exp(var(--z${o}));`)
  }
  props.push(`@property --esum{syntax:'<number>';inherits:true;initial-value:1}`)
  decl.push(`--esum:calc(${Array.from({ length: shape.outputs }, (_, o) => `var(--e${o})`).join(' + ')});`)
  for (let o = 0; o < shape.outputs; o++) decl.push(`--p${o}:calc(var(--e${o}) / var(--esum));`)
  return `${props.join('\n')}\n${scope}{${decl.join('')}}`
}

export function randomInput(shape, r) { return Float32Array.from({ length: shape.inputs }, () => r()) }
export const inlineInputs = x => Array.from(x, (v, i) => `--x${i}:${f(v)}`).join(';')
