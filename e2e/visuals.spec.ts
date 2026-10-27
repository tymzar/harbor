import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CARDS, CARD_IDS } from '../src/cssnet/contract'
import { CALM, NORMAL, RUSHED, SCREENS, humanClick, l1, openFresh, recordMetrics, resetMouse } from './helpers'

mkdirSync(SCREENS, { recursive: true })
const TRANSITION_SETTLE = 800 // visuals transition --cn-f* over 520 ms

const patternStyles = (page: Page) => page.evaluate(() => {
  const q = (s: string) => getComputedStyle(document.querySelector(`[data-testid=pattern-layer] ${s}`)!)
  const base = q('.cn-pattern__base'), glow = q('.cn-pattern__glow'), grain = q('.cn-pattern__grain')
  return { baseFilter: base.filter, baseTransform: base.transform, glowOpacity: glow.opacity, glowTransform: glow.transform, glowFilter: glow.filter, grainOpacity: grain.opacity }
})

/** State of the live network view: its data attributes, output labels, and a canvas fingerprint. */
const netProbe = (page: Page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid=network-view]') as HTMLElement
  const cv = el.querySelector('canvas') as HTMLCanvasElement
  const g = cv.getContext('2d')!
  const d = g.getImageData(0, 0, cv.width, cv.height).data
  let lit = 0
  for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 0) lit++
  return {
    top: el.dataset.top!, weights: el.dataset.weights!, lit, w: cv.width, h: cv.height,
    // CSS-driven nodes: values live in the computing elements' own styles.
    outputs: [...el.querySelectorAll<HTMLElement>('[data-net-scope][data-active] [data-node=output]')]
      .sort((a, b) => +a.dataset.k! - +b.dataset.k!)
      .map((o) => ({ k: +o.dataset.k!, pct: Number(o.computedStyleMap().get('--cn-pct')!.toString()), top: Number(o.computedStyleMap().get('--nv-top')!.toString()) })),
    hiddenW: [...el.querySelectorAll<HTMLElement>('[data-net-scope][data-active] [data-node=hidden]')]
      .sort((a, b) => +a.dataset.j! - +b.dataset.j!).map((h) => parseFloat(getComputedStyle(h).width)),
  }
})
const flatW = (w: { W1: number[]; b1: number[]; W2: number[]; b2: number[] } | null) => (w ? [...w.W1, ...w.b1, ...w.W2, ...w.b2] : [])

test('pattern layer and network view respond to the network', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openFresh(page); resetMouse()
  await page.waitForTimeout(TRANSITION_SETTLE)
  const p0 = await patternStyles(page)
  await page.getByTestId('nav-model').click(); await page.waitForTimeout(TRANSITION_SETTLE)
  const d0 = await netProbe(page)
  const w0 = flatW(await page.evaluate(() => window.__smartweb.weights()))
  const h0 = await page.evaluate(() => window.__smartweb.hidden())
  await page.screenshot({ path: join(SCREENS, 'visuals-before.png') })
  await page.getByTestId('network-view').screenshot({ path: join(SCREENS, 'network-before.png') })
  await page.getByTestId('nav-home').click()
  await page.evaluate(() => scrollTo(0, 0)) // element screenshots scroll; humanClick aims in the viewport

  const journey = ['card-drafts-open', 'card-team-share', 'card-drafts-favorite', 'card-drafts-open', 'card-team-open', 'card-calendar-open']
  const intens = [CALM, RUSHED, NORMAL]
  for (let k = 0; k < journey.length; k++) await humanClick(page, journey[k], intens[k % 3])
  await page.waitForTimeout(TRANSITION_SETTLE)
  const p1 = await patternStyles(page)
  await page.getByTestId('nav-model').click(); await page.waitForTimeout(TRANSITION_SETTLE)
  const d1 = await netProbe(page)
  const w1 = flatW(await page.evaluate(() => window.__smartweb.weights()))
  const h1 = await page.evaluate(() => window.__smartweb.hidden())
  await page.screenshot({ path: join(SCREENS, 'visuals-after.png') })
  await page.getByTestId('network-view').screenshot({ path: join(SCREENS, 'network-after.png') })
  await page.getByTestId('pattern-layer').screenshot({ path: join(SCREENS, 'pattern-layer-after.png') })

  const changed = Object.keys(p0).filter((k) => p0[k as keyof typeof p0] !== p1[k as keyof typeof p1])
  const css = await page.evaluate(() => window.__smartweb.cssOutputs())
  recordMetrics('visuals', {
    patternBefore: p0, patternAfter: p1, patternChangedProps: changed,
    networkBefore: d0, networkAfter: d1,
    weightsL1Change: l1(w0, w1), hiddenBefore: h0, hiddenAfter: h1,
    screenshots: ['visuals-before.png', 'visuals-after.png', 'network-before.png', 'network-after.png', 'pattern-layer-after.png'],
  })
  expect(l1(w0, w1), 'weights changed through training').toBeGreaterThan(0.1)
  expect(l1(h0, h1), 'CSS hidden activations changed').toBeGreaterThan(0.01)
  for (const v of [p1.baseFilter, p1.baseTransform, p1.glowTransform]) expect(v).not.toBe('none')
  expect(changed.length, JSON.stringify({ p0, p1 })).toBeGreaterThan(0)
  // The network view draws the live weights and shows the CSS engine's own outputs.
  expect(d1.lit, 'canvas has drawn content').toBeGreaterThan(500)
  expect(d1.weights).not.toBe(d0.weights)
  // The active category's net builds output nodes only for its own 6 cards, keyed by global index data-k.
  expect(d1.outputs).toHaveLength(6)
  const ks = d1.outputs.map((o) => o.k)
  expect(ks.map((k) => CARDS[k].category), 'active scope outputs belong to the current category').toEqual(Array(6).fill('home'))
  const top = ks.reduce((bi, k) => (css[k] > css[bi] ? k : bi), ks[0])
  expect(d1.top, 'network view top output = CSS argmax').toBe(CARD_IDS[top])
  // Nodes are drawn by CSS: printed percentages, argmax flag and hidden sizes come from the stylesheet.
  for (const o of d1.outputs) expect(o.pct, `output ${o.k} pct`).toBe(Math.round(css[o.k] * 100))
  expect(d1.outputs.filter((o) => o.top === 1).map((o) => o.k), 'CSS argmax flag').toEqual([top])
  await checkNodes(page, 'calc')
})

/** After transitions settle, every hidden node's CSS width equals 5 + 8 * a/(a+1) for the CSS activation a. */
async function checkNodes(page: Page, mode: string) {
  await page.waitForTimeout(2000)
  const r = await page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-net-scope][data-active] [data-node=hidden]')].sort((a, b) => +a.dataset.j! - +b.dataset.j!)
    const h = window.__smartweb.hidden()
    return { n: els.length, diff: Math.max(...els.map((el, j) => { const a = Math.max(0, h[j]); return Math.abs(parseFloat(getComputedStyle(el).width) - (5 + 8 * a / (a + 1))) })) }
  })
  expect(r.n, `${mode}: hidden nodes`).toBe(16)
  expect(r.diff, `${mode}: hidden node size matches CSS activation`).toBeLessThan(0.05)
}

test('CSS-driven nodes track the network in every engine mode', async ({ page }) => {
  await openFresh(page); resetMouse()
  for (const id of ['nav-explore', 'card-moss-open', 'card-tidepools-favorite', 'card-moss-share']) await humanClick(page, id, NORMAL)
  for (const mode of ['calc', 'hybrid', 'animation']) {
    await page.getByTestId('mode-select').selectOption(mode)
    await humanClick(page, 'card-tidepools-open', NORMAL)
    await checkNodes(page, mode)
    const pcts = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-net-scope][data-active] [data-node=output]')]
      .map((o) => ({ k: +o.dataset.k!, pct: Number(o.computedStyleMap().get('--cn-pct')!.toString()) })))
    const css = await page.evaluate(() => window.__smartweb.cssOutputs())
    expect(pcts.map((o) => o.k).sort((a, b) => a - b), `${mode}: active scope = explore's outputs`)
      .toEqual(CARDS.flatMap((c, k) => (c.category === 'explore' ? [k] : [])))
    for (const o of pcts) expect(o.pct, `${mode}: CSS counter percentage of output ${o.k}`).toBe(Math.round(css[o.k] * 100))
    // Masked outputs (other categories) are invisible, in-scope ones visible: opacity is var(--cn-m{k}).
    const op = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-net-scope][data-active] [data-node=output]')]
      .sort((a, b) => +a.dataset.k! - +b.dataset.k!).map((o) => Number(getComputedStyle(o).opacity)))
    expect(op.filter((v) => v === 1)).toHaveLength(6)
    // Full model: every category's net shows its own 6 outputs, so 18 are visible in total.
    const visibleAll = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-testid=cssnet-host] [data-node=output]')]
      .filter((o) => getComputedStyle(o).opacity === '1').length)
    expect(visibleAll).toBe(18)
  }
})
