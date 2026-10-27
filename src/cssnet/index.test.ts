// jsdom does not compute CSS; these tests cover mounting, DOM structure, property writes
// and teardown. Numeric parity is checked by parity.check.mjs in headless Chromium.
import { afterEach, describe, expect, it } from 'vitest'
import { MODE_NOTES, mountCssNet } from './index'
import { randomWeights } from './reference'
import { num } from './generate'
import type { CssNet, NetShape } from './contract'

const shape: NetShape = { inputs: 15, hidden: 16, outputs: 8 }
let nets: CssNet[] = []
afterEach(() => { for (const n of nets) n.destroy(); nets = []; document.body.innerHTML = '' })

const mount = (mode: 'calc' | 'hybrid' | 'animation', opts?: { literalWeights?: boolean }) => {
  const host = document.createElement('div'); document.body.appendChild(host)
  const net = mountCssNet(host, shape, mode, { probe: false, ...opts }); nets.push(net)
  return { host, net }
}

describe('mountCssNet', () => {
  it('throws (and cleans up) in an environment that does not compute CSS, so callers can fall back', () => {
    const host = document.createElement('div'); document.body.appendChild(host)
    expect(() => mountCssNet(host, shape, 'calc')).toThrow(/CSS compute unavailable/)
    expect(host.children.length).toBe(0)
    expect(document.head.querySelectorAll('style[data-cssnet]').length).toBe(0)
  })
  it('calc: one root element, inputs inline, stylesheets in head', () => {
    const { host, net } = mount('calc')
    expect(net.mode).toBe('calc'); expect(net.shape).toEqual(shape)
    const root = host.firstElementChild as HTMLElement
    expect(root.children.length).toBe(0)
    expect(root.dataset.cssnet).toBe('calc')
    expect(document.head.querySelectorAll('style[data-cssnet]').length).toBe(2)
    net.setInputs(Float32Array.from({ length: 15 }, (_, i) => i / 10))
    expect(root.style.getPropertyValue('--cn-x3')).toBe(num(Math.fround(0.3)))
    expect(root.style.getPropertyValue('--cn-x14')).toBe(num(Math.fround(1.4)))
    expect(net.readOutputs().length).toBe(8)
    expect(net.readHidden().length).toBe(16)
  })
  it('setWeights rewrites the weights rule (and keyframes only for literal animation modes)', () => {
    const w = randomWeights(shape, 2)
    const { net } = mount('calc')
    net.setWeights(w)
    const sheets = Array.from(document.head.querySelectorAll('style[data-cssnet]'))
    const ws = sheets.find((s) => (s as HTMLElement).dataset.cssnet?.endsWith('-weights')) as HTMLStyleElement
    expect(ws.textContent).toContain('--cn-w1-0-0:')
    expect(ws.textContent).toContain(`--cn-b2-7:${Number(w.b2[7].toPrecision(9))}`)
    const main = sheets.find((s) => (s as HTMLElement).dataset.cssnet?.endsWith('-calc')) as HTMLStyleElement
    expect(main.textContent).not.toContain('@keyframes')
  })
  it('hybrid: all animations on the root; literal keyframes regenerate on setWeights', () => {
    const { host } = mount('hybrid')
    const root = host.firstElementChild as HTMLElement
    expect(root.children.length).toBe(0)
    const main = document.head.querySelector('style[data-cssnet$="-hybrid"]') as HTMLStyleElement
    expect(main.textContent).toContain('@keyframes cn')
    expect(main.textContent).not.toContain('var(--cn-w1-')
    expect(main.textContent).not.toContain('var(--cn-b2-')
    const before = main.textContent
    nets[0].setWeights(randomWeights(shape, 4))
    expect(main.textContent).not.toBe(before)
  })
  it('hybrid with literalWeights=false keeps a static stylesheet and writes a weights rule', () => {
    mount('hybrid', { literalWeights: false })
    const main = document.head.querySelector('style[data-cssnet$="-hybrid"]') as HTMLStyleElement
    const before = main.textContent
    expect(before).toContain('var(--cn-w1-0-0)')
    nets[0].setWeights(randomWeights(shape, 4))
    expect(main.textContent).toBe(before)
    expect(document.head.querySelector('style[data-cssnet$="-weights"]')?.textContent).toContain('--cn-w1-0-0:')
  })
  it('literal modes register no weight properties and add no weights sheet', () => {
    mount('animation')
    expect(document.head.querySelectorAll('style[data-cssnet]').length).toBe(1)
    const main = document.head.querySelector('style[data-cssnet$="-animation"]') as HTMLStyleElement
    expect(main.textContent).not.toContain('--cn-w1-')
    expect(main.textContent).not.toContain('--cn-b1-')
  })
  it('animation: nested chain root > (n > f > p) x H > out', () => {
    const { host, net } = mount('animation')
    const root = host.firstElementChild as HTMLElement
    let el: Element | null = root, depth = 0
    const classes: string[] = []
    while (el && el.firstElementChild) { el = el.firstElementChild; classes.push(el.className.split(' ')[0]); depth++ }
    expect(depth).toBe(3 * 16 + 1)
    expect(classes.slice(0, 3).map((c) => c.split('-')[1])).toEqual(['n', 'f', 'p'])
    expect(classes[classes.length - 1].endsWith('-out')).toBe(true)
    expect(host.querySelectorAll('[class$="-f"]').length).toBe(16)
    expect(net.readHidden().length).toBe(16)
    expect(net.readOutputs().length).toBe(8)
  })
  it('destroy removes the DOM and both stylesheets; later calls are no-ops', () => {
    const { host, net } = mount('animation')
    net.destroy()
    expect(host.children.length).toBe(0)
    expect(document.head.querySelectorAll('style[data-cssnet]').length).toBe(0)
    net.setInputs(new Float32Array(15)); net.setWeights(randomWeights(shape))
    expect(net.readOutputs().length).toBe(8)
  })
  it('instances get distinct class prefixes so keyframes never collide', () => {
    const a = mount('hybrid').host.firstElementChild as HTMLElement
    const b = mount('hybrid').host.firstElementChild as HTMLElement
    expect(a.className.split(' ')[0]).not.toBe(b.className.split(' ')[0])
  })
  it('documents every mode', () => {
    for (const m of ['calc', 'hybrid', 'animation'] as const) expect(MODE_NOTES[m].length).toBeGreaterThan(50)
  })
})
