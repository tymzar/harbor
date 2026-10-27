import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page } from '@playwright/test'
import type { ActionId, SmartWebTestHook } from '../src/cssnet/contract'
import type { SmartWebTestExtras } from '../src/app/controller'

export type Hook = SmartWebTestHook & SmartWebTestExtras
declare global { interface Window { __smartweb: Hook } }

export const ALL_ACTIONS: ActionId[] = ['nav-home', 'nav-explore', 'nav-library', 'search', 'open-card', 'favorite', 'share', 'settings']

export async function ready(page: Page) {
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-testid=replay-journey]') as HTMLButtonElement | null
    return !!window.__smartweb && !!b && !b.disabled
  })
}

/** Fresh app with an empty model (IndexedDB cleared through the app's own reset). */
export async function openFresh(page: Page) {
  await page.goto('/')
  await ready(page)
  await page.evaluate(() => window.__smartweb.reset())
  await page.evaluate(() => window.__smartweb.idle())
}

export const stats = (page: Page) => page.evaluate(() => window.__smartweb.stats())

/** Pointer dynamics of one interaction. */
export interface Intensity {
  /** pointer move steps on the approach and ms between them */
  steps: number
  stepMs: number
  /** ms resting over the target before pressing (hover dwell) */
  dwellMs: number
  /** ms between pointerdown and pointerup */
  pressMs: number
  /** ms after the action before the next approach starts */
  gapMs: number
  /** px of random-free wobble while hovering (tremor), applied as small moves */
  wobble: number
}

export const CALM: Intensity = { steps: 28, stepMs: 16, dwellMs: 350, pressMs: 420, gapMs: 250, wobble: 0 }
export const RUSHED: Intensity = { steps: 3, stepMs: 4, dwellMs: 0, pressMs: 25, gapMs: 30, wobble: 3 }
export const NORMAL: Intensity = { steps: 10, stepMs: 12, dwellMs: 80, pressMs: 90, gapMs: 120, wobble: 0 }

/** Box of an element once it has stopped moving (grid reorders animate with a spring). */
export async function stableBox(page: Page, testId: string) {
  const loc = page.getByTestId(testId)
  let prev = await loc.boundingBox()
  let still = 0
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(16)
    const b = await loc.boundingBox()
    if (b && prev && Math.abs(b.x - prev.x) < 0.25 && Math.abs(b.y - prev.y) < 0.25) {
      if (++still >= 5) return b
    } else still = 0
    prev = b
  }
  if (!prev) throw new Error(`no box for ${testId}`)
  return prev
}

let mousePos = { x: 640, y: 360 }

/**
 * A human-ish press on a control via page.mouse: approach in `steps` timed moves,
 * hover (optionally with tremor), press for pressMs, release. Returns when the
 * model has applied the resulting training step.
 */
export async function humanClick(page: Page, action: ActionId, it: Intensity, offset = { dx: 0, dy: 0 }) {
  const before = (await stats(page)).examples
  const b = await stableBox(page, `action-${action}`)
  const tx = b.x + b.width / 2 + offset.dx
  const ty = b.y + b.height / 2 + offset.dy
  const sx = mousePos.x, sy = mousePos.y
  for (let k = 1; k <= it.steps; k++) {
    const f = k / it.steps
    await page.mouse.move(sx + (tx - sx) * f, sy + (ty - sy) * f)
    if (it.stepMs) await page.waitForTimeout(it.stepMs)
  }
  if (it.wobble) {
    for (let k = 0; k < 4; k++) await page.mouse.move(tx + (k % 2 ? it.wobble : -it.wobble), ty + (k % 2 ? -it.wobble : it.wobble))
    await page.mouse.move(tx, ty)
  }
  if (it.dwellMs) await page.waitForTimeout(it.dwellMs)
  mousePos = { x: tx, y: ty }
  await page.mouse.down()
  if (it.pressMs) await page.waitForTimeout(it.pressMs)
  await page.mouse.up()
  await expect.poll(async () => (await stats(page)).examples, { timeout: 5000 }).toBeGreaterThan(before)
  if (it.gapMs) await page.waitForTimeout(it.gapMs)
}

export function resetMouse() { mousePos = { x: 640, y: 360 } }

export const maxAbsDiff = (a: number[], b: number[]) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0)
export const l1 = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0)
export const argmax = (a: number[]) => a.reduce((bi, v, i) => (v > a[bi] ? i : bi), 0)

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const METRICS_FILE = join(ROOT, 'reports', 'e2e-metrics.json')
export const SCREENS = join(ROOT, 'reports', 'screens')

/** Merge one section into reports/e2e-metrics.json (workers: 1, so read-modify-write is safe). */
export function recordMetrics(section: string, data: unknown) {
  mkdirSync(dirname(METRICS_FILE), { recursive: true })
  let all: Record<string, unknown> = {}
  try { all = JSON.parse(readFileSync(METRICS_FILE, 'utf8')) } catch { /* first write */ }
  // Merge into the section: Playwright restarts the worker after a failure, so tests in one
  // file cannot accumulate a section in module state.
  const gl = process.platform === 'darwin' && !process.env.SMARTWEB_SOFTWARE_GL ? 'ANGLE Metal (headless, --use-angle=metal)' : 'SwiftShader (headless default)'
  all[section] = { ...(all[section] as object | undefined), ...(data as object), gl, platform: process.platform, recordedAt: new Date().toISOString() }
  writeFileSync(METRICS_FILE, JSON.stringify(all, null, 2))
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]
}

export const domGridOrder = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-testid=adaptive-grid] > [data-grid-action]')].map((e) => e.getAttribute('data-grid-action')!))

export const topSuggestion = (page: Page) =>
  page.getByTestId('suggestion-item').first().getAttribute('data-action')

/** True when `b` is `a` with at most one element moved to another position. */
export function atMostOneMoved(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  if (a.every((v, i) => v === b[i])) return true
  return a.some((m) => {
    const ra = a.filter((v) => v !== m), rb = b.filter((v) => v !== m)
    return ra.every((v, i) => v === rb[i])
  })
}
