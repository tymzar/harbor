import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DotGrid, PatternLayer } from './index'
import { VISUAL_CSS, activationVars } from './styles'

describe('visual layers', () => {
  it('PatternLayer renders its testid and activation custom properties', () => {
    const html = renderToStaticMarkup(<PatternLayer hidden={[0.5, 2, 0]} />)
    expect(html).toContain('data-testid="pattern-layer"')
    expect(html).toContain('--cn-f0:0.5')
    expect(html).toContain('--cn-f1:2')
    expect(html).toContain('--cn-f3:0.5') // cycles when shorter than 16
    expect(html).toContain('cn-pattern__base')
  })
  it('DotGrid renders three nested transform wrappers and size vars', () => {
    const html = renderToStaticMarkup(<DotGrid hidden={new Float32Array(16)} size={200} perspective={500} />)
    expect(html).toContain('data-testid="dot-grid"')
    expect(html).toContain('--cn-size:200px')
    expect(html).toContain('--cn-persp:500px')
    expect(html).toContain('cn-dotgrid__m1')
    expect(html).toContain('cn-dotgrid__m3')
  })
  it('reads activations from a net when hidden is omitted', () => {
    const net = { shape: { inputs: 1, hidden: 2, outputs: 1 }, mode: 'calc' as const, setWeights() {}, setInputs() {}, readOutputs: () => new Float32Array(1), readHidden: () => Float32Array.from([1.25, 0]), destroy() {} }
    const html = renderToStaticMarkup(<PatternLayer net={net} />)
    expect(html).toContain('--cn-f0:1.25')
  })
  it('activationVars is NaN-safe and the stylesheet only animates compositor properties per frame', () => {
    expect(activationVars([NaN, Infinity])['--cn-f0']).toBe('0')
    expect(activationVars(undefined)['--cn-f15']).toBe('0')
    expect(VISUAL_CSS).toContain('will-change:filter,transform')
    expect(VISUAL_CSS).toContain('matrix3d(')
    expect(VISUAL_CSS).toContain("@property --cn-f15{syntax:'<number>'")
  })
})
