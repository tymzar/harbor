import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ActionId } from '../src/cssnet/contract'
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
    outputs: [...el.querySelectorAll<HTMLElement>('[data-testid=network-output]')].map((o) => [o.dataset.action!, o.textContent!] as [string, string]),
  }
})
const flatW = (w: { W1: number[]; b1: number[]; W2: number[]; b2: number[] } | null) => (w ? [...w.W1, ...w.b1, ...w.W2, ...w.b2] : [])

test('pattern layer and network view respond to the network', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openFresh(page); resetMouse()
  await page.waitForTimeout(TRANSITION_SETTLE)
  const p0 = await patternStyles(page)
  const d0 = await netProbe(page)
  const w0 = flatW(await page.evaluate(() => window.__smartweb.weights()))
  const h0 = await page.evaluate(() => window.__smartweb.hidden())
  await page.screenshot({ path: join(SCREENS, 'visuals-before.png') })
  await page.getByTestId('network-view').screenshot({ path: join(SCREENS, 'network-before.png') })
  await page.evaluate(() => scrollTo(0, 0)) // element screenshots scroll; humanClick aims in the viewport

  const journey: ActionId[] = ['nav-explore', 'open-card', 'favorite', 'share', 'nav-library', 'open-card']
  const intens = [CALM, RUSHED, NORMAL]
  for (let k = 0; k < journey.length; k++) await humanClick(page, journey[k], intens[k % 3])
  await page.waitForTimeout(TRANSITION_SETTLE)
  const p1 = await patternStyles(page)
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
  expect(d1.outputs).toHaveLength(8)
  const top = css.indexOf(Math.max(...css))
  expect(d1.top, 'network view top output = CSS argmax').toBe(['nav-home', 'nav-explore', 'nav-library', 'search', 'open-card', 'favorite', 'share', 'settings'][top])
  for (const [k, [, text]] of d1.outputs.entries()) expect(text).toContain(`${(css[k] * 100).toFixed(0)}%`)
})
