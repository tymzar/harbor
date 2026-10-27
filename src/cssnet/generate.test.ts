import { describe, expect, it } from 'vitest'
import { H_MAX, X_MAX, X_MIN, animationStylesheet, calcStylesheet, hybridStylesheet, inputsStyle, num, prop, softmaxDeclarations, weightsRule } from './generate'
import { randomWeights } from './reference'
import type { NetShape } from './contract'

const shape: NetShape = { inputs: 15, hidden: 16, outputs: 8 }
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length

describe('num', () => {
  it('round-trips float32 and never emits NaN/Infinity', () => {
    const v = Math.fround(0.3)
    expect(Math.fround(parseFloat(num(v)))).toBe(v)
    expect(num(NaN)).toBe('0'); expect(num(Infinity)).toBe('0'); expect(num(-0)).toBe('0')
    expect(num(1e-9)).toMatch(/^1e-9$/)
  })
})

describe('calcStylesheet', () => {
  const css = calcStylesheet(shape, 'cn1')
  it('literal variant bakes weights and biases in and registers only inputs', () => {
    const w = randomWeights(shape, 11)
    const lit = calcStylesheet(shape, 'cnL', w)
    expect(lit).toContain(`--cn-h2:max(0, ${num(w.b1[2])} + ${num(w.W1[2 * 15])} * var(--cn-x0)`)
    expect(lit).not.toContain('var(--cn-w')
    expect(count(lit, /@property --cn-w/g)).toBe(0)
    expect(count(lit, /@property --cn-x\d+\{/g)).toBe(15)
  })
  it('registers one @property per neuron, parameter and softmax term', () => {
    expect(count(css, /@property --cn-h\d+\{/g)).toBe(16)
    expect(count(css, /@property --cn-x\d+\{/g)).toBe(15)
    expect(count(css, /@property --cn-w1-\d+-\d+\{/g)).toBe(16 * 15)
    expect(count(css, /@property --cn-w2-\d+-\d+\{/g)).toBe(8 * 16)
    expect(count(css, /@property --cn-p\d+\{/g)).toBe(8)
    expect(count(css, /@property --cn-is\d+\{/g)).toBe(8)
    expect(css).toMatch(/syntax:'<number>'/)
  })
  it('builds relu hidden neurons from weight custom properties', () => {
    expect(css).toContain(`${prop.h(0)}:max(0, var(--cn-b1-0) + var(--cn-w1-0-0) * var(--cn-x0) + var(--cn-w1-0-1) * var(--cn-x1)`)
    expect(css).toContain(`${prop.h(15)}:max(0, var(--cn-b1-15)`)
  })
  it('uses a max-shifted softmax and argmax flags', () => {
    expect(css).toContain('--cn-zmax:max(var(--cn-z0),var(--cn-z1)')
    expect(css).toContain('--cn-e3:exp(var(--cn-z3) - var(--cn-zmax))')
    expect(css).toContain('--cn-p7:calc(var(--cn-e7) / var(--cn-esum))')
    expect(css).toContain('--cn-is0:calc(1 - clamp(0, (var(--cn-pmax) - var(--cn-p0)) * 1e6, 1))')
    expect(css).not.toMatch(/@keyframes/)
  })
})

describe('hybridStylesheet', () => {
  it('has one keyframes rule per hidden weight and all animations on the root', () => {
    const css = hybridStylesheet(shape, 'cn2')
    expect(count(css, /@keyframes cn2-h\d+-\d+\{/g)).toBe(16 * 15)
    expect(css).toContain(`@keyframes cn2-h0-0{from{--cn-h0:calc(var(--cn-w1-0-0) * ${X_MIN})}to{--cn-h0:calc(var(--cn-w1-0-0) * ${X_MAX})}}`)
    expect(css).toContain('animation-composition:add')
    expect(css).toContain('animation-play-state:paused')
    expect(css).toContain(`animation-duration:${X_MAX - X_MIN}s`)
    expect(count(css, /calc\(\(var\(--cn-x\d+\) - -4\) \* -1s\)/g)).toBe(16 * 15)
    expect(css).toContain('--cn-a0:max(0, var(--cn-h0))')
    expect(css).toContain('var(--cn-w2-0-0) * var(--cn-a0)')
  })
  it('bakes literal weights into keyframes when weights are given', () => {
    const w = randomWeights(shape, 3)
    const css = hybridStylesheet(shape, 'cn3', w)
    expect(css).not.toContain('var(--cn-w1-')
    expect(css).not.toContain('@property --cn-w1-')
    expect(css).toContain(`--cn-h5:${num(w.b1[5])}`)
    expect(css).toContain(`@keyframes cn3-h0-0{from{--cn-h0:${num(w.W1[0] * X_MIN)}}to{--cn-h0:${num(w.W1[0] * X_MAX)}}}`)
  })
})

describe('animationStylesheet', () => {
  const css = animationStylesheet(shape, 'cn4')
  it('has keyframes for both layers and the em bridge', () => {
    expect(count(css, /@keyframes cn4-h\d+-\d+\{/g)).toBe(16 * 15)
    expect(count(css, /@keyframes cn4-o\d+-\d+\{/g)).toBe(8 * 16)
    expect(css).toContain(`.cn4-f{display:block;font-size:calc((var(--cn-h) + ${H_MAX}) * 1px)`)
    expect(css).toContain('animation-delay:calc(((1em / 1px) - 16 + 16) * -1s)')
    expect(css).toContain('animation-timing-function:linear(0, 0 50%, 1)')
    expect(css).toContain(`animation-duration:${2 * H_MAX}s`)
    expect(css).toContain(`@keyframes cn4-o7-15{from{--cn-o7:0}to{--cn-o7:calc(var(--cn-w2-7-15) * ${H_MAX})}}`)
    expect(css).toContain('.cn4-root{')
    expect(css).toContain('--cn-o0:var(--cn-b2-0)')
    expect(css).toContain('.cn4-n0{--cn-h:var(--cn-b1-0);animation-name:cn4-h0-0,')
    expect(css).toContain('.cn4-out{display:block;--cn-z0:calc(var(--cn-o0) - (1 - var(--cn-m0)) * 30)')
  })
  it('never sets font-size on the neuron or p elements', () => {
    for (const rule of css.split('\n').filter((l) => l.startsWith('.cn4-n') || l.startsWith('.cn4-p'))) expect(rule).not.toContain('font-size')
  })
})

describe('weightsRule / inputsStyle', () => {
  it('writes every weight and bias as a custom property with float32-safe literals', () => {
    const w = randomWeights(shape, 9)
    const rule = weightsRule(shape, 'cn5-w', w)
    expect(rule.startsWith('.cn5-w{')).toBe(true)
    expect(count(rule, /--cn-w1-\d+-\d+:/g)).toBe(240)
    expect(count(rule, /--cn-w2-\d+-\d+:/g)).toBe(128)
    expect(count(rule, /--cn-b1-\d+:/g)).toBe(16)
    expect(count(rule, /--cn-b2-\d+:/g)).toBe(8)
    expect(rule).toContain(`--cn-w1-2-3:${num(w.W1[2 * 15 + 3])}`)
    expect(rule).not.toMatch(/NaN|Infinity/)
  })
  it('inputsStyle sets --cn-x{i} and pads missing inputs with 0', () => {
    expect(inputsStyle({ inputs: 3, hidden: 1, outputs: 1 }, [0.5, -2])).toBe('--cn-x0:0.5;--cn-x1:-2;--cn-x2:0')
  })
  it('softmaxDeclarations references the given logit expressions', () => {
    const d = softmaxDeclarations({ inputs: 1, hidden: 1, outputs: 2 }, (k) => `var(--L${k})`)
    expect(d[0]).toBe('--cn-z0:calc(var(--L0) - (1 - var(--cn-m0)) * 30)')
    expect(d).toContain('--cn-esum:calc(var(--cn-e0) + var(--cn-e1))')
  })
})
