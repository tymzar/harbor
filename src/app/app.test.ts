import { describe, expect, it } from 'vitest'
import { ACTIONS, type ActionId } from '../cssnet/contract'
import { PRIOR, SHAPE } from '../model/config'
import { ModelClient } from '../model/client'
import { forward, initWeights } from '../model/mlp'
import { memoryStore } from '../model/persist'
import { FeatureExtractor } from '../signals/extractor'
import { RAW_FEATURE_NAMES } from '../signals/features'
import { GRID_ACTIONS, blend, nextGridOrder, rank } from './adaptive'
import { SmartWebController } from './controller'
import { createFallbackNet, isProbVector, localJsForward } from './cssnetBridge'
import { generateJourney, synthesizeStep } from './replay'

const scores = (m: Partial<Record<ActionId, number>>) => {
  const rest = (1 - Object.values(m).reduce((a, b) => a + b, 0)) / (ACTIONS.length - Object.keys(m).length)
  return ACTIONS.map((a) => m[a] ?? rest)
}

describe('adaptive grid guardrails', () => {
  it('moves at most one element per interaction', () => {
    const cur = [...GRID_ACTIONS] // open-card, favorite, share, search, settings
    const s = scores({ settings: 0.4, share: 0.3, 'open-card': 0.01, favorite: 0.01, search: 0.01 })
    const r1 = nextGridOrder(cur, s, PRIOR)
    expect(r1.moved).toBe('settings')
    expect(r1.order).toEqual(['settings', 'open-card', 'favorite', 'share', 'search'])
    const r2 = nextGridOrder(r1.order, s, PRIOR)
    expect(r2.moved).toBe('share')
    expect(r2.order).toEqual(['settings', 'share', 'open-card', 'favorite', 'search'])
  })
  it('does not move when confidence does not beat the prior by the margin', () => {
    const s = [...PRIOR]
    s[ACTIONS.indexOf('settings')] += 0.03 // above favorite/share but below the 0.06 margin
    s[ACTIONS.indexOf('nav-home')] -= 0.03
    expect(nextGridOrder(GRID_ACTIONS, s, PRIOR).moved).toBeNull()
  })
  it('rank and blend', () => {
    expect(rank(PRIOR)[0]).toBe('open-card')
    const b = blend([1, 0], [0, 1], 0.25)
    expect(Array.from(b)).toEqual([0.75, 0.25])
  })
})

describe('cssnet bridge fallback', () => {
  it('local JS forward matches the worker MLP and the fallback net', () => {
    const w = initWeights(SHAPE, PRIOR, 3)
    const x = Float32Array.from({ length: SHAPE.inputs }, (_, i) => Math.sin(i))
    const a = localJsForward(SHAPE, w, x).out
    const b = forward(SHAPE, w, x).out
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6))
    const net = createFallbackNet(document.createElement('div'), SHAPE, 'calc')
    net.setWeights(w); net.setInputs(x)
    expect(isProbVector(net.readOutputs(), 8)).toBe(true)
    expect(isProbVector([NaN, 1], 2)).toBe(false)
  })
})

describe('journey replay', () => {
  it('is deterministic per seed and produces decelerating straight-ish approaches', () => {
    const j1 = generateJourney(42, 30)
    expect(generateJourney(42, 30)).toEqual(j1)
    expect(generateJourney(43, 30)).not.toEqual(j1)
    expect(j1).toHaveLength(30)
    const fx = new FeatureExtractor(0)
    const out = synthesizeStep(fx, { ...j1[0], rage: 0 }, { x: 0, y: 0 }, { left: 400, top: 300, width: 100, height: 40 }, 'action-x', 1000, 1)
    const v = fx.snapshot(j1[0].action, out.t)
    const at = (n: string) => v[RAW_FEATURE_NAMES.indexOf(n)]
    expect(at('deceleration')).toBeGreaterThan(0)
    expect(at('pathStraightness')).toBeGreaterThan(0.8)
    expect(at('hoverDwell')).toBeGreaterThan(50)
    expect(at('pressDuration')).toBeGreaterThanOrEqual(70)
  })
})

describe('SmartWebController (jsdom, in-thread model, JS net)', () => {
  it('starts, learns from actions, exposes the test hook, resets', async () => {
    const c = new SmartWebController({ makeClient: () => new ModelClient({ forceLocal: true, store: memoryStore() }) })
    await c.start(document.createElement('div'))
    const hook = window.__smartweb
    expect(hook.stats().examples).toBe(0)
    for (let k = 0; k < 12; k++) await c.act((['nav-explore', 'open-card', 'favorite'] as ActionId[])[k % 3])
    const st = hook.stats()
    expect(st.examples).toBe(12) // the initial idle prediction is pending too
    expect(st.markovAcc).toBeGreaterThan(0.5)
    expect(hook.features()).toHaveLength(15)
    expect(hook.ranking()[0]).toBe('nav-explore') // after favorite comes nav-explore
    const css = hook.cssOutputs(), js = hook.jsOutputs()
    css.forEach((v, i) => expect(v).toBeCloseTo(js[i], 5))
    hook.setMode('hybrid')
    expect(hook.stats().mode).toBe('hybrid')
    await hook.reset()
    expect(hook.stats().examples).toBe(0)
    c.stop()
  })
})

declare global { interface Window { __smartweb: import('../cssnet/contract').SmartWebTestHook } }
