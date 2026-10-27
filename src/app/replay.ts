import type { ActionId } from '../cssnet/contract'
import { mulberry32 } from '../model/mlp'
import type { FeatureExtractor } from '../signals/extractor'

export interface JourneyStep {
  action: ActionId
  /** ms of pointer travel to the target */
  approachMs: number
  /** ms hovering on the target before pressing */
  dwellMs: number
  /** ms between pointerdown and pointerup */
  pressMs: number
  /** ms of idle "thinking" before the movement starts */
  thinkMs: number
  /** extra rapid presses (rage clicks) after the first */
  rage: number
}

/**
 * A habitual journey with some noise: browse explore -> open -> favorite,
 * sometimes share, then library -> open, back home; occasional search.
 * Deterministic for a given seed.
 */
export function generateJourney(seed: number, length = 40): JourneyStep[] {
  const rnd = mulberry32(seed)
  const habits: ActionId[][] = [
    ['nav-explore', 'open-card', 'favorite', 'share'],
    ['nav-library', 'open-card', 'favorite'],
    ['search', 'open-card', 'share'],
    ['nav-home', 'settings'],
  ]
  const weights = [0.45, 0.3, 0.15, 0.1]
  const steps: JourneyStep[] = []
  while (steps.length < length) {
    let r = rnd(), h = 0
    while (h < weights.length - 1 && r > weights[h]) { r -= weights[h]; h++ }
    for (const action of habits[h]) {
      if (steps.length >= length) break
      const hesitant = rnd() < 0.2
      steps.push({
        action,
        approachMs: 220 + rnd() * 380,
        dwellMs: hesitant ? 400 + rnd() * 700 : 60 + rnd() * 200,
        pressMs: 70 + rnd() * 90,
        thinkMs: 300 + rnd() * 900,
        rage: action === 'share' && rnd() < 0.25 ? 2 + Math.floor(rnd() * 3) : 0,
      })
    }
  }
  return steps
}

export interface Rect { left: number; top: number; width: number; height: number }

/**
 * Feed one step into the extractor on a virtual clock starting at t.
 * Minimum-jerk path (bell-shaped velocity, so it decelerates into the target),
 * small curvature and end tremor. Returns the virtual time of the final pointerup.
 */
export function synthesizeStep(
  fx: FeatureExtractor, step: JourneyStep, from: { x: number; y: number }, rect: Rect,
  targetKey: string, t: number, seed: number,
): { t: number; pos: { x: number; y: number }; downT: number } {
  const rnd = mulberry32(seed)
  const tx = rect.left + rect.width * (0.3 + rnd() * 0.4)
  const ty = rect.top + rect.height * (0.3 + rnd() * 0.4)
  let now = t + step.thinkMs
  const bend = (rnd() - 0.5) * 0.3
  const n = Math.max(2, Math.round(step.approachMs / 16))
  for (let k = 1; k <= n; k++) {
    const s = k / n
    const e = 10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5 // minimum-jerk
    const px = from.x + (tx - from.x) * e - (ty - from.y) * bend * Math.sin(Math.PI * e)
    const py = from.y + (ty - from.y) * e + (tx - from.x) * bend * Math.sin(Math.PI * e)
    fx.pointerMove({ t: now + (k / n) * step.approachMs, x: px, y: py })
  }
  now += step.approachMs
  fx.pointerOver(now, targetKey)
  const dwellSamples = Math.max(1, Math.round(step.dwellMs / 16))
  for (let k = 1; k <= dwellSamples; k++) {
    fx.pointerMove({ t: now + (k / dwellSamples) * step.dwellMs, x: tx + (rnd() - 0.5) * 1.5, y: ty + (rnd() - 0.5) * 1.5 })
  }
  now += step.dwellMs
  let downT = now
  for (let r = 0; r <= step.rage; r++) {
    downT = now
    fx.pointerDown({ t: now, x: tx, y: ty, pointerType: 'mouse', pressure: 0.5, rect, targetKey })
    now += step.pressMs
    fx.pointerUp(now)
    if (r < step.rage) now += 90 + rnd() * 60
  }
  return { t: now, pos: { x: tx, y: ty }, downT }
}
