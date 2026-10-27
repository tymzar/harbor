import { describe, expect, it } from 'vitest'
import { ACTIONS } from '../cssnet/contract'
import { FeatureExtractor } from './extractor'
import { MODEL_FEATURES, MODEL_INPUTS, NORMALISE_MASK, RAW_FEATURE_COUNT, RAW_FEATURE_NAMES, selectModelFeatures } from './features'
import { RunningNorm } from './normalizer'

const at = (v: Float32Array, name: string) => v[RAW_FEATURE_NAMES.indexOf(name)]
const fixedDate = () => new Date(2026, 0, 1, 6, 0) // 06:00 -> quarter day

describe('feature catalogue', () => {
  it('has 52 raw features and a 15-feature model subset', () => {
    expect(RAW_FEATURE_COUNT).toBe(52)
    expect(MODEL_INPUTS).toBe(15)
    expect(MODEL_FEATURES.slice(7).map((f) => f.name)).toEqual(ACTIONS.map((a) => `last1:${a}`))
  })
})

describe('FeatureExtractor', () => {
  it('computes pointer dynamics for a straight decelerating approach', () => {
    const fx = new FeatureExtractor(0, { width: 1280 }, fixedDate)
    // 300ms approach: fast (2 px/ms) for 150ms then slow (0.5 px/ms) for 150ms, straight line
    let x = 0
    for (let t = 1000; t <= 1150; t += 10) { fx.pointerMove({ t, x, y: 100 }); x += 20 }
    for (let t = 1160; t <= 1300; t += 10) { fx.pointerMove({ t, x, y: 100 }); x += 5 }
    fx.pointerOver(1100, 'action-favorite')
    fx.pointerDown({ t: 1300, x, y: 100, pointerType: 'mouse', pressure: 0.5, targetKey: 'action-favorite',
      rect: { left: x - 50, top: 80, width: 100, height: 40 } })
    fx.pointerUp(1390)
    const v = fx.snapshot('favorite', 1400)
    expect(at(v, 'pressDuration')).toBe(90)
    expect(at(v, 'approachVelocity')).toBeGreaterThan(0.5)
    expect(at(v, 'deceleration')).toBeGreaterThan(1)
    expect(at(v, 'pathStraightness')).toBeCloseTo(1, 5)
    expect(at(v, 'hoverDwell')).toBe(200)
    expect(at(v, 'offsetFromCenter')).toBeCloseTo(0, 5)
    expect(at(v, 'targetSize')).toBeCloseTo(Math.sqrt(4000), 3)
    expect(at(v, 'burstCount2s')).toBe(1)
    expect(at(v, 'pressure')).toBeCloseTo(0.5)
    expect(at(v, `last1:favorite`)).toBe(1)
    expect(at(v, 'todSin')).toBeCloseTo(1, 5)
    expect(at(v, 'viewportClass')).toBe(1)
  })

  it('detects rage-click bursts and tremor', () => {
    const fx = new FeatureExtractor(0)
    for (let k = 0; k < 5; k++) {
      const t = 5000 + k * 150
      fx.pointerMove({ t: t - 20, x: 100 + (k % 2 ? 3 : -3), y: 100 + (k % 2 ? -3 : 3) })
      fx.pointerDown({ t, x: 100, y: 100 })
      fx.pointerUp(t + 40)
    }
    const v = fx.snapshot('share', 5700)
    expect(at(v, 'burstCount2s')).toBe(5)
    expect(at(v, 'tremor')).toBeGreaterThan(1)
    expect(at(v, 'timeSinceLastClick')).toBe(150)
  })

  it('keeps the last 3 actions as one-hots, most recent first', () => {
    const fx = new FeatureExtractor(0)
    fx.snapshot('nav-explore', 10)
    fx.snapshot('open-card', 20)
    const v = fx.snapshot('favorite', 30)
    expect(at(v, 'last1:favorite')).toBe(1)
    expect(at(v, 'last2:open-card')).toBe(1)
    expect(at(v, 'last3:nav-explore')).toBe(1)
    expect(Array.from(v.slice(28)).reduce((a, b) => a + b, 0)).toBe(3)
    expect(at(v, 'actionCount')).toBe(3)
  })

  it('tracks scroll reversals, keyboard cadence and view revisits', () => {
    const fx = new FeatureExtractor(0)
    fx.scroll({ t: 100, y: 0, max: 1000 })
    fx.scroll({ t: 200, y: 300, max: 1000 })
    fx.scroll({ t: 300, y: 100, max: 1000 })
    fx.scroll({ t: 400, y: 500, max: 1000 })
    ;['a', 'b', 'Backspace', 'c'].forEach((key, k) => fx.key({ t: 1000 + k * 100, key }))
    fx.key({ t: 1500, key: 'k', meta: true })
    fx.snapshot('nav-explore', 2000)
    fx.snapshot('nav-home', 3000)
    const v = fx.snapshot('nav-explore', 4000)
    expect(at(v, 'scrollReversals')).toBe(2)
    expect(at(v, 'scrollDepth')).toBeCloseTo(0.5)
    expect(at(v, 'keysPerSec')).toBe(1)
    expect(at(v, 'backspaceRatio')).toBeCloseTo(0.2)
    expect(at(v, 'shortcutUse')).toBe(1)
    expect(at(v, 'revisitCount')).toBe(2)
    expect(at(v, 'timeOnView')).toBe(0)
  })

  it('selects and transforms the model subset', () => {
    const fx = new FeatureExtractor(0)
    fx.pointerDown({ t: 0, x: 0, y: 0 })
    fx.pointerUp(100)
    const m = selectModelFeatures(fx.snapshot('search', 120))
    expect(m.length).toBe(15)
    expect(m[0]).toBeCloseTo(Math.log1p(100), 5)
    expect(m[7 + ACTIONS.indexOf('search')]).toBe(1)
  })
})

describe('RunningNorm', () => {
  it('matches batch mean/std and leaves masked features alone', () => {
    const n = new RunningNorm(2, [true, false])
    const xs = [1, 2, 3, 4, 10]
    xs.forEach((x) => n.update([x, x]))
    const mean = xs.reduce((a, b) => a + b) / xs.length
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1))
    const z = n.apply([4, 1])
    expect(z[0]).toBeCloseTo((4 - mean) / sd, 5)
    expect(z[1]).toBe(1)
    const m = new RunningNorm(2, [true, false])
    m.load(n.toJSON())
    expect(m.apply([4, 1])[0]).toBeCloseTo(z[0], 6)
  })
  it('clamps to +-4 and the default mask follows MODEL_FEATURES', () => {
    const n = new RunningNorm(1)
    ;[0, 0.1, -0.1, 0].forEach((x) => n.update([x]))
    expect(n.apply([100])[0]).toBe(4)
    expect(NORMALISE_MASK.filter(Boolean).length).toBe(7)
  })
})
