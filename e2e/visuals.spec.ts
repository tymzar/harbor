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

/** Projected corner positions of the dot lattice: zero-size probe spans at the lattice corners. */
const dotProbe = (page: Page) => page.evaluate(() => {
  const dots = document.querySelector('[data-testid=dot-grid] .cn-dotgrid__dots') as HTMLElement
  let probes = dots.querySelectorAll<HTMLElement>('span[data-probe]')
  if (!probes.length) {
    for (const [x, y] of [[0, 0], [100, 0], [0, 100], [100, 100], [50, 50]]) {
      const s = document.createElement('span')
      s.dataset.probe = `${x},${y}`
      s.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:0;height:0`
      dots.appendChild(s)
    }
    dots.style.position = 'relative'
    probes = dots.querySelectorAll<HTMLElement>('span[data-probe]')
  }
  const m = (s: string) => getComputedStyle(document.querySelector(`[data-testid=dot-grid] ${s}`)!).transform
  return {
    points: [...probes].map((p) => { const r = p.getBoundingClientRect(); return [r.left, r.top] as [number, number] }),
    m1: m('.cn-dotgrid__m1'), m2: m('.cn-dotgrid__m2'), m3: m('.cn-dotgrid__m3'),
  }
})
const flatW = (w: { W1: number[]; b1: number[]; W2: number[]; b2: number[] } | null) => (w ? [...w.W1, ...w.b1, ...w.W2, ...w.b2] : [])

test('pattern layer and dot grid respond to the network', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openFresh(page); resetMouse()
  await page.waitForTimeout(TRANSITION_SETTLE)
  const p0 = await patternStyles(page)
  const d0 = await dotProbe(page)
  const w0 = flatW(await page.evaluate(() => window.__smartweb.weights()))
  const h0 = await page.evaluate(() => window.__smartweb.hidden())
  await page.screenshot({ path: join(SCREENS, 'visuals-before.png') })
  await page.getByTestId('dot-grid').screenshot({ path: join(SCREENS, 'dot-grid-before.png') })

  const journey: ActionId[] = ['nav-explore', 'open-card', 'favorite', 'share', 'nav-library', 'open-card']
  const intens = [CALM, RUSHED, NORMAL]
  for (let k = 0; k < journey.length; k++) await humanClick(page, journey[k], intens[k % 3])
  await page.waitForTimeout(TRANSITION_SETTLE)
  const p1 = await patternStyles(page)
  const d1 = await dotProbe(page)
  const w1 = flatW(await page.evaluate(() => window.__smartweb.weights()))
  const h1 = await page.evaluate(() => window.__smartweb.hidden())
  await page.screenshot({ path: join(SCREENS, 'visuals-after.png') })
  await page.getByTestId('dot-grid').screenshot({ path: join(SCREENS, 'dot-grid-after.png') })
  await page.getByTestId('pattern-layer').screenshot({ path: join(SCREENS, 'pattern-layer-after.png') })

  const changed = Object.keys(p0).filter((k) => p0[k as keyof typeof p0] !== p1[k as keyof typeof p1])
  const shift = Math.max(...d0.points.map(([x, y], i) => Math.hypot(x - d1.points[i][0], y - d1.points[i][1])))
  recordMetrics('visuals', {
    patternBefore: p0, patternAfter: p1, patternChangedProps: changed,
    dotPointsBefore: d0.points, dotPointsAfter: d1.points, dotMaxShiftPx: shift,
    weightsL1Change: l1(w0, w1), hiddenBefore: h0, hiddenAfter: h1,
    screenshots: ['visuals-before.png', 'visuals-after.png', 'dot-grid-before.png', 'dot-grid-after.png', 'pattern-layer-after.png'],
  })
  expect(l1(w0, w1), 'weights changed through training').toBeGreaterThan(0.1)
  expect(l1(h0, h1), 'CSS hidden activations changed').toBeGreaterThan(0.01)
  // Every derived value is a real computed style, not 'none'.
  for (const v of [p1.baseFilter, p1.baseTransform, p1.glowTransform, d1.m1, d1.m2, d1.m3]) expect(v).not.toBe('none')
  expect(changed.length, JSON.stringify({ p0, p1 })).toBeGreaterThan(0)
  expect(d1.m1).not.toBe(d0.m1)
  expect(shift, 'projected dot-lattice corners moved').toBeGreaterThan(1)
})
