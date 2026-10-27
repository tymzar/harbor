// r1-mlp-gen: generates the CSS + DOM for a fully-animation 2-layer MLP (inputs -> hidden(relu) -> outputs), em-bridge.
// Structure (nested chain, one hidden neuron per level):
//   root[--x0..--x{I-1} set by JS; --o{k}: b2[k]]
//     > h0.n  [--h: b1[0]; I paused animations on --h, delay -x_i s, to-value W1[0][i], composition add]  (hidden j = 0)
//       > h0.f [font-size: (var(--h) + HOFF) px]                                                           (em bridge)
//         > p0  [O paused animations on --o{k}, delay from 1em, to-value W2[k][0]*HMAX, relu easing, composition add on INHERITED --o{k}]
//           > h1.n > h1.f > p1 > ... > p{H-1}  (--o{k} on p{H-1} = b2[k] + sum_j W2[k][j]*relu(h_j))
//             > out [calc softmax: --e{k} = exp(--o{k}); --z = sum; --p{k} = --e{k}/--z]
export const HMIN = -8, HMAX = 8, HOFF = 8
export function reluEasing() { return 'linear(0, 0 50%, 1)' }

export function genCss(shape, w, { prefix = '' } = {}) {
  const { inputs: I, hidden: H, outputs: O } = shape
  const DUR2 = HMAX - HMIN
  let css = ''
  for (let i = 0; i < I; i++) css += `@property --x${i} { syntax: '<number>'; inherits: true; initial-value: 0; }\n`
  css += `@property --h { syntax: '<number>'; inherits: true; initial-value: 0; }\n`
  for (let k = 0; k < O; k++) css += `@property --o${k} { syntax: '<number>'; inherits: true; initial-value: 0; }\n@property --e${k} { syntax: '<number>'; inherits: false; initial-value: 0; }\n@property --p${k} { syntax: '<number>'; inherits: false; initial-value: 0; }\n`
  css += `@property --z { syntax: '<number>'; inherits: false; initial-value: 1; }\n`
  // hidden keyframes: one per (j,i)
  for (let j = 0; j < H; j++) for (let i = 0; i < I; i++) css += `@keyframes ${prefix}h${j}-${i} { from { --h: 0 } to { --h: ${w.W1[j * I + i]} } }\n`
  // output keyframes: one per (k,j)
  for (let k = 0; k < O; k++) for (let j = 0; j < H; j++) css += `@keyframes ${prefix}o${k}-${j} { from { --o${k}: 0 } to { --o${k}: ${w.W2[k * H + j] * HMAX} } }\n`
  const delays1 = Array.from({ length: I }, (_, i) => `calc(var(--x${i}) * -1s)`).join(', ')
  css += `.${prefix}root { ${Array.from({ length: O }, (_, k) => `--o${k}: ${w.b2[k]};`).join(' ')} }\n`
  css += `.${prefix}n { animation-duration: 1s; animation-timing-function: linear; animation-play-state: paused; animation-fill-mode: both; animation-composition: add; animation-delay: ${delays1}; }\n`
  css += `.${prefix}f { font-size: calc((var(--h) + ${HOFF}) * 1px); }\n`
  css += `.${prefix}p { animation-duration: ${DUR2}s; animation-timing-function: ${reluEasing()}; animation-play-state: paused; animation-fill-mode: both; animation-composition: add; animation-delay: calc(((1em / 1px) - ${HOFF} - ${HMIN}) * -1s); }\n`
  for (let j = 0; j < H; j++) {
    css += `.${prefix}n${j} { --h: ${w.b1[j]}; animation-name: ${Array.from({ length: I }, (_, i) => `${prefix}h${j}-${i}`).join(', ')}; }\n`
    css += `.${prefix}p${j} { animation-name: ${Array.from({ length: O }, (_, k) => `${prefix}o${k}-${j}`).join(', ')}; }\n`
  }
  const es = Array.from({ length: O }, (_, k) => `--e${k}: calc(exp(var(--o${k})));`).join(' ')
  const z = `--z: calc(${Array.from({ length: O }, (_, k) => `var(--e${k})`).join(' + ')});`
  const ps = Array.from({ length: O }, (_, k) => `--p${k}: calc(var(--e${k}) / var(--z));`).join(' ')
  css += `.${prefix}out { ${es} ${z} ${ps} }\n`
  return css
}

export function genHtml(shape, { prefix = '' } = {}) {
  const H = shape.hidden
  let html = `<div class="${prefix}root" data-role="root">`
  for (let j = 0; j < H; j++) html += `<div class="${prefix}n ${prefix}n${j}" data-role="h" data-j="${j}"><div class="${prefix}f"><div class="${prefix}p ${prefix}p${j}" data-role="p" data-j="${j}">`
  html += `<div class="${prefix}out" data-role="out"></div>`
  for (let j = 0; j < H; j++) html += `</div></div></div>`
  html += `</div>`
  return html
}

export function jsForward(shape, w, x) {
  const { inputs: I, hidden: H, outputs: O } = shape
  const hidden = new Float64Array(H), out = new Float64Array(O)
  for (let j = 0; j < H; j++) { let s = w.b1[j]; for (let i = 0; i < I; i++) s += w.W1[j * I + i] * x[i]; hidden[j] = s }
  for (let k = 0; k < O; k++) { let s = w.b2[k]; for (let j = 0; j < H; j++) s += w.W2[k * H + j] * Math.max(0, Math.min(HMAX, hidden[j])); out[k] = s }
  let m = -Infinity; for (const v of out) m = Math.max(m, v)
  const e = Array.from(out, v => Math.exp(v - m)); const z = e.reduce((a, b) => a + b, 0)
  return { hidden, logits: out, probs: e.map(v => v / z) }
}

export function randomWeights(shape, seed = 42) {
  let s = seed; const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff * 2 - 1 }
  const { inputs: I, hidden: H, outputs: O } = shape
  return {
    W1: Float32Array.from({ length: H * I }, () => rand() * 0.4), b1: Float32Array.from({ length: H }, () => rand()),
    W2: Float32Array.from({ length: O * H }, () => rand()), b2: Float32Array.from({ length: O }, () => rand() * 0.5),
  }
}
