// Live-session driver, persona "explorer".
// Phase A (random): near-random actions with varied intensity, heavy scrolling, typing in search.
// Phase B (pattern): the same explorer settles into a 4-step loop halfway through.
// Run from the repo root:  node reports/sessions/explorer/session.mjs [baseURL]
// Writes trace.json, *.png and session.webm next to this file.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, renameSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = process.env.OUT ?? dirname(fileURLToPath(import.meta.url))
const BASE = process.argv[2] ?? 'http://127.0.0.1:5183'
const SEED = Number(process.env.SEED ?? 1234)
const N_RANDOM = Number(process.env.N_RANDOM ?? 60)
const N_PATTERN = Number(process.env.N_PATTERN ?? 64)
const PATTERN = ['nav-explore', 'open-card', 'share', 'search']
const ACTIONS = ['nav-home', 'nav-explore', 'nav-library', 'search', 'open-card', 'favorite', 'share', 'settings']
const VIEW = { width: 1280, height: 720 }

// ---- seeded rng ----
let s = SEED >>> 0
const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const uni = (a, b) => a + (b - a) * rnd()
const int = (a, b) => Math.floor(uni(a, b + 1))
const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
const logn = (median, spread) => median * Math.exp(spread * (rnd() + rnd() + rnd() - 1.5)) // rough log-normal

// ---- intensity styles (the explorer's mood drifts between these) ----
function sampleIntensity() {
  const mood = pick(['calm', 'normal', 'normal', 'rushed', 'jittery'])
  const base = {
    calm: { steps: int(22, 40), stepMs: int(12, 20), dwell: logn(450, 0.8), press: logn(380, 0.5), wobble: 0 },
    normal: { steps: int(9, 18), stepMs: int(8, 14), dwell: logn(120, 0.8), press: logn(100, 0.5), wobble: 0 },
    rushed: { steps: int(3, 6), stepMs: int(2, 6), dwell: logn(10, 1), press: logn(30, 0.4), wobble: 0 },
    jittery: { steps: int(6, 14), stepMs: int(5, 10), dwell: logn(200, 0.7), press: logn(70, 0.6), wobble: uni(1.5, 4) },
  }[mood]
  return { mood, ...base, overshoot: rnd() < 0.25, think: logn(700, 1.0), rage: mood === 'rushed' && rnd() < 0.25 }
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
let mouse = { x: VIEW.width / 2, y: VIEW.height / 2 }

async function moveTo(page, tx, ty, it) {
  const sx = mouse.x, sy = mouse.y
  // curved path: quadratic bezier with a random perpendicular control point
  const mx = (sx + tx) / 2, my = (sy + ty) / 2
  const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy) || 1
  const bend = uni(-0.25, 0.25) * len
  const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend
  const ox = it.overshoot ? dx * 0.08 : 0, oy = it.overshoot ? dy * 0.08 : 0
  for (let k = 1; k <= it.steps; k++) {
    const t = easeInOut(k / it.steps)
    const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * (tx + ox)
    const y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * (ty + oy)
    await page.mouse.move(x, y)
    if (it.stepMs) await page.waitForTimeout(it.stepMs)
  }
  if (it.overshoot) { for (let k = 1; k <= 4; k++) { await page.mouse.move(tx + ox * (1 - k / 4), ty + oy * (1 - k / 4)); await page.waitForTimeout(12) } }
  if (it.wobble) for (let k = 0; k < 5; k++) { await page.mouse.move(tx + uni(-it.wobble, it.wobble), ty + uni(-it.wobble, it.wobble)); await page.waitForTimeout(8) }
  await page.mouse.move(tx, ty)
  mouse = { x: tx, y: ty }
}

async function heavyScroll(page) {
  const bursts = int(1, 4)
  let total = 0
  for (let b = 0; b < bursts; b++) {
    const dir = rnd() < 0.55 ? 1 : -1
    const ticks = int(3, 12)
    const speed = pick([40, 80, 120, 200, 400])
    for (let k = 0; k < ticks; k++) { await page.mouse.wheel(0, dir * speed * uni(0.6, 1.4)); total++; await page.waitForTimeout(int(8, 40)) }
    await page.waitForTimeout(int(50, 400))
  }
  return total
}

async function stableBox(page, testId) {
  const loc = page.getByTestId(testId).first()
  let prev = await loc.boundingBox(), still = 0
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(16)
    const b = await loc.boundingBox()
    if (b && prev && Math.abs(b.x - prev.x) < 0.25 && Math.abs(b.y - prev.y) < 0.25) { if (++still >= 4) return b } else still = 0
    prev = b
  }
  return prev
}

/** Bring the target into view the way a person would: wheel toward it. */
async function wheelIntoView(page, testId) {
  for (let k = 0; k < 20; k++) {
    const b = await stableBox(page, testId)
    if (!b) return null
    if (b.y >= 60 && b.y + b.height <= VIEW.height - 10) return b
    const dy = b.y < 60 ? Math.max(-300, b.y - 150) : Math.min(300, b.y + b.height - VIEW.height + 150)
    await page.mouse.wheel(0, dy)
    await page.waitForTimeout(60)
  }
  return stableBox(page, testId)
}

const hook = (page, fn) => page.evaluate(fn)
const snapshot = (page) => page.evaluate(() => {
  const h = window.__smartweb
  return {
    stats: h.stats(), ranking: h.ranking(), cssOutputs: h.cssOutputs(), jsOutputs: h.jsOutputs(), latencies: h.latencies(),
    markov: h.markov(), blended: h.blended(), alpha: h.alpha(), gridOrder: h.gridOrder(),
    domGrid: [...document.querySelectorAll('[data-testid=adaptive-grid] > [data-grid-action]')].map((e) => e.getAttribute('data-grid-action')),
    suggestions: [...document.querySelectorAll('[data-testid=suggestion-item]')].map((e) => [e.getAttribute('data-action'), e.textContent]),
    scrollY: window.scrollY, scrollMax: document.documentElement.scrollHeight - innerHeight,
  }
})

const WORDS = ['moss', 'basalt', 'night sky', 'recipes', 'typography', 'asdf', 'field notes', 'team', 'xyz', 'coast']

async function perform(page, action, it, info) {
  const before = (await hook(page, () => window.__smartweb.stats())).examples
  const tid = `action-${action}`
  const b = await wheelIntoView(page, tid)
  if (!b) { info.error = 'no box'; return 0 }
  const tx = b.x + b.width * uni(0.3, 0.7), ty = b.y + b.height * uni(0.35, 0.65)
  await moveTo(page, tx, ty, it)
  if (it.dwell) await page.waitForTimeout(it.dwell)
  const presses = it.rage ? int(3, 5) : 1
  for (let p = 0; p < presses; p++) {
    await page.mouse.down(); await page.waitForTimeout(Math.max(8, it.press)); await page.mouse.up()
    if (p < presses - 1) await page.waitForTimeout(int(40, 110))
  }
  info.presses = presses
  if (action === 'search') {
    const word = pick(WORDS)
    await page.keyboard.press('ControlOrMeta+a').catch(() => {})
    const cps = it.mood === 'rushed' ? [30, 70] : it.mood === 'calm' ? [140, 320] : [70, 180]
    for (const ch of word) { await page.keyboard.type(ch); await page.waitForTimeout(int(...cps)) }
    info.typed = word
    if (rnd() < 0.6) { await page.waitForTimeout(int(100, 600)); await page.keyboard.press('Enter'); info.enter = true }
  }
  let after = before
  for (let k = 0; k < 60; k++) { after = (await hook(page, () => window.__smartweb.stats())).examples; if (after > before) break; await page.waitForTimeout(50) }
  await page.evaluate(() => window.__smartweb.idle())
  await page.waitForTimeout(80) // let the latency measurement land
  after = (await hook(page, () => window.__smartweb.stats())).examples
  if (action === 'search') {
    // move pointer off the input and click empty space so the next keystrokes don't go into search
    await moveTo(page, uni(400, 900), 690, { steps: 6, stepMs: 6, wobble: 0, overshoot: false })
  }
  return after - before
}

const argmax = (a) => a.reduce((bi, v, i) => (v > a[bi] ? i : bi), 0)
const shot = async (page, name, trace, why) => { const p = join(OUT, `${name}.png`); await page.screenshot({ path: p }); trace.screenshots.push({ name: `${name}.png`, why }) }

async function main() {
  mkdirSync(OUT, { recursive: true })
  const vidDir = join(OUT, '_video')
  const gpuArgs = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : []
  const browser = await chromium.launch({ headless: true, args: gpuArgs })
  const ctx = await browser.newContext({ viewport: VIEW, ...(process.env.NO_VIDEO ? {} : { recordVideo: { dir: vidDir, size: { width: 960, height: 540 } } }) })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push({ type: m.type(), text: m.text().slice(0, 300) }) })
  page.on('pageerror', (e) => consoleErrors.push({ type: 'pageerror', text: String(e).slice(0, 300) }))
  await page.goto(BASE)
  await page.waitForFunction(() => { const b = document.querySelector('[data-testid=replay-journey]'); return !!window.__smartweb && b && !b.disabled })
  await page.evaluate(() => window.__smartweb.reset())
  await page.evaluate(() => window.__smartweb.idle())
  const trace = { persona: 'explorer', seed: SEED, base: BASE, viewport: VIEW, pattern: PATTERN, nRandom: N_RANDOM, nPattern: N_PATTERN, startedAt: new Date().toISOString(), screenshots: [], steps: [], consoleErrors, gl: null }
  trace.gl = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl'); const e = c?.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : null })
  const initial = await snapshot(page)
  trace.initial = initial
  // explorer opens the debug drawer early (curious), which also makes the page scroll
  if (initial.scrollMax < 50) {
    const db = await stableBox(page, 'debug-toggle')
    await moveTo(page, db.x + db.width / 2, db.y + db.height / 2, { steps: 14, stepMs: 10, wobble: 0, overshoot: false })
    await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up(); await page.waitForTimeout(300)
    trace.openedDebug = true
  }
  trace.scrollMaxAfterDebug = (await snapshot(page)).scrollMax
  await shot(page, '01-cold-start', trace, 'fresh model after reset, before any interaction')

  const plan = []
  for (let i = 0; i < N_RANDOM; i++) plan.push({ phase: 'random', action: pick(ACTIONS) })
  for (let i = 0; i < N_PATTERN; i++) plan.push({ phase: 'pattern', action: PATTERN[i % PATTERN.length] })

  let firstAdapt = null, firstReorder = null, firstPatternReorder = null, weirdShots = 0
  for (let i = 0; i < plan.length; i++) {
    const { phase, action } = plan[i]
    const it = sampleIntensity()
    const info = { i, phase, action, mood: it.mood, pressMs: Math.round(it.press), dwellMs: Math.round(it.dwell), steps: it.steps, rage: it.rage }
    await page.waitForTimeout(Math.min(4000, it.think))
    if (rnd() < (phase === 'random' ? 0.55 : 0.3)) info.wheelTicks = await heavyScroll(page)
    const pre = await snapshot(page)
    info.pre = { ranking: pre.ranking, markov: pre.markov, blended: pre.blended, css: pre.cssOutputs, gridOrder: pre.gridOrder, domGrid: pre.domGrid, suggestions: pre.suggestions }
    const t0 = Date.now()
    info.examplesDelta = await perform(page, action, it, info)
    info.wallMs = Date.now() - t0
    const post = await snapshot(page)
    info.post = post
    const topPred = pre.ranking[0]
    info.topHit = topPred === action
    info.markovHit = ACTIONS[argmax(pre.markov)] === action
    info.mlpHit = ACTIONS[argmax(pre.cssOutputs)] === action
    info.topProb = Math.max(...pre.blended)
    info.cssJsMaxDiff = post.cssOutputs.reduce((m, v, k) => Math.max(m, Math.abs(v - post.jsOutputs[k])), 0)
    const moved = JSON.stringify(pre.gridOrder) !== JSON.stringify(post.gridOrder)
    info.gridMoved = moved
    info.domGridMismatch = JSON.stringify(post.domGrid) !== JSON.stringify(post.gridOrder)
    trace.steps.push(info)
    const tag = `${i}`.padStart(3, '0')
    if (info.examplesDelta !== 1) {
      console.log(`!! step ${i} ${action}: examplesDelta=${info.examplesDelta}`)
      if (weirdShots < 4) { weirdShots++; await shot(page, `weird-${tag}-${action}-delta${info.examplesDelta}`, trace, `examples changed by ${info.examplesDelta} for one ${action} interaction (presses=${info.presses}, enter=${!!info.enter})`) }
    }
    if (firstAdapt === null && (info.topHit || moved)) { firstAdapt = i; await shot(page, `02-first-adaptation-${tag}`, trace, `first visible adaptation (${info.topHit ? 'top suggestion hit' : 'grid reorder'}) at interaction ${i}`) }
    if (firstReorder === null && moved) { firstReorder = i; if (firstAdapt !== i) await shot(page, `03-first-reorder-${tag}`, trace, `first grid reorder at interaction ${i} (${phase})`) }
    if (phase === 'pattern' && firstPatternReorder === null && moved) { firstPatternReorder = i; await shot(page, `04-first-pattern-reorder-${tag}`, trace, `first grid reorder after the pattern started, interaction ${i}`) }
    if (i === N_RANDOM - 1) await shot(page, '05-end-of-random-phase', trace, 'last interaction of the random phase')
    if (i === N_RANDOM + 23) await shot(page, '06-pattern-6-cycles', trace, 'after 6 cycles of the pattern')
    console.log(`${tag} ${phase.padEnd(7)} ${action.padEnd(11)} ${it.mood.padEnd(7)} top=${topPred.padEnd(11)} p=${info.topProb.toFixed(2)} hit=${info.topHit ? 1 : 0} mk=${info.markovHit ? 1 : 0} mlp=${info.mlpHit ? 1 : 0} moved=${moved ? 1 : 0} d=${info.examplesDelta} lat=${post.latencies.at(-1)?.toFixed(1)}`)
  }
  // scroll to top for the final screenshot
  await page.mouse.wheel(0, -5000); await page.waitForTimeout(400)
  await shot(page, '07-end', trace, 'end of session')
  trace.finishedAt = new Date().toISOString()
  trace.final = await snapshot(page)
  writeFileSync(join(OUT, 'trace.json'), JSON.stringify(trace, null, 1))
  const video = page.video()
  await ctx.close(); await browser.close()
  if (video) { const p = await video.path(); if (existsSync(p)) renameSync(p, join(OUT, 'session.webm')) }
  rmSync(vidDir, { recursive: true, force: true })
  console.log('done', join(OUT, 'trace.json'))
}

main().catch((e) => { console.error(e); process.exit(1) })
