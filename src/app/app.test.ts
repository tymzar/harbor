import { describe, expect, it } from 'vitest'
import { CARD_IDS, cardsOf, categoryMask } from '../cssnet/contract'
import { PRIOR, SHAPE } from '../model/config'
import { ModelClient } from '../model/client'
import { forward, initWeights } from '../model/mlp'
import { memoryStore } from '../model/persist'
import { FeatureExtractor } from '../signals/extractor'
import { RAW_FEATURE_NAMES } from '../signals/features'
import { MIN_EVIDENCE, blendScores, defaultOrders, movedCards, reorder } from './adaptive'
import { SmartWebController } from './controller'
import { createFallbackNet, isProbVector, localJsForward } from './cssnetBridge'
import { generateJourney, stepTestId, synthesizeStep } from './replay'

describe('ordering', () => {
  it('blends, re-sorts with hysteresis and reports what moved', () => {
    const aff = CARD_IDS.map((id) => (id === 'notes' ? 0.5 : 0.1))
    const mlp = CARD_IDS.map((id) => (id === 'inbox' ? 0.5 : 0.1))
    const s = blendScores(aff, mlp, 0.25)
    const next = reorder(defaultOrders().home, s)
    expect(next.slice(0, 2)).toEqual(['notes', 'inbox'])
    expect(movedCards(defaultOrders().home, next)).toContain('notes')
    expect(MIN_EVIDENCE).toBeGreaterThan(1)
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
    net.setWeights(w); net.setInputs(x, categoryMask('explore'))
    const out = net.readOutputs()
    expect(isProbVector(out, SHAPE.outputs)).toBe(true)
    cardsOf('home').forEach((id) => expect(out[CARD_IDS.indexOf(id)]).toBeLessThan(1e-9))
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
    const card = j1.find((s) => s.target.kind === 'card')!
    expect(stepTestId(card.target)).toMatch(/^card-[a-z]+-(open|favorite|share)$/)
    const out = synthesizeStep(fx, { ...card, rage: 0 }, { x: 0, y: 0 }, { left: 400, top: 300, width: 100, height: 40 }, 'card-x', 1000, 1)
    const v = fx.snapshot(card.target.kind === 'card' ? card.target.verb : 'open', out.t)
    const at = (n: string) => v[RAW_FEATURE_NAMES.indexOf(n)]
    expect(at('deceleration')).toBeGreaterThan(0)
    expect(at('pathStraightness')).toBeGreaterThan(0.8)
    expect(at('hoverDwell')).toBeGreaterThan(50)
    expect(at('pressDuration')).toBeGreaterThanOrEqual(70)
  })
})

describe('SmartWebController (jsdom, in-thread model, JS net)', () => {
  it('learns a full category order, applies it on entry, exposes the hook, resets', async () => {
    const c = new SmartWebController({ makeClient: () => new ModelClient({ forceLocal: true, store: memoryStore() }) })
    await c.start(document.createElement('div'))
    const hook = window.__smartweb
    expect(hook.stats().examples).toBe(0)
    expect(hook.order()).toEqual(cardsOf('home'))
    for (let k = 0; k < 6; k++) {
      await c.engage('notes', k % 2 ? 'share' : 'open', { t: k * 4000 })
      await c.engage('inbox', 'open', { t: k * 4000 + 2000 })
    }
    expect(hook.stats().examples).toBe(12)
    expect(hook.order().slice(0, 2)).toEqual(['notes', 'inbox'])
    expect(hook.features()).toHaveLength(12)
    const css = hook.cssOutputs(), js = hook.jsOutputs()
    css.forEach((v, i) => expect(v).toBeCloseTo(js[i], 5))
    await c.enter('library')
    expect(hook.category()).toBe('library')
    expect(hook.order()).toEqual(cardsOf('library'))
    expect(hook.order('home').slice(0, 2)).toEqual(['notes', 'inbox'])
    hook.setMode('hybrid')
    expect(hook.stats().mode).toBe('hybrid')
    await hook.reset()
    expect(hook.stats().examples).toBe(0)
    expect(hook.order('home')).toEqual(cardsOf('home'))
    c.stop()
  })
})

declare global { interface Window { __smartweb: import('../cssnet/contract').SmartWebTestHook } }
