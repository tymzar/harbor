// Live-session driver, persona "frustrated" (rage-clicker).
// Run from the repo root:  node reports/sessions/frustrated/session.mjs
// Needs a dev server on http://127.0.0.1:5182 (npx vite --port 5182 --strictPort).
//
// The persona has the same goal loop as a normal user (Explore -> Open a card ->
// Favorite -> Share/Search -> Home), but: short presses, fast jittery pointer paths
// with overshoot, rage-click bursts on "Open" when nothing visible happens, angry
// double/triple toggling of Compact mode after a burst, back-and-forth navigation,
// jerky scrolling, and typo-heavy typing in Search. Everything is driven through
// page.mouse / page.keyboard (real input events), never through element.click().
//
// Every interaction is sampled from window.__smartweb into trace.json.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = process.env.SESSION_OUT ?? dirname(fileURLToPath(import.meta.url))
const BASE = process.env.SMARTWEB_URL ?? 'http://127.0.0.1:5182'
const SEED = Number(process.env.SEED ?? 1337)
const CYCLES = Number(process.env.CYCLES ?? 24)
const ACTIONS = ['nav-home', 'nav-explore', 'nav-library', 'search', 'open-card', 'favorite', 'share', 'settings']
const PRIOR = [0.15, 0.15, 0.12, 0.12, 0.16, 0.1, 0.08, 0.12]

// ---------- seeded randomness ----------
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const rnd = mulberry32(SEED)
const U = (a, b) => a + (b - a) * rnd()
const I = (a, b) => Math.floor(U(a, b + 1))
const chance = (p) => rnd() < p
const gauss = () => { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return s - 3 }

const argmax = (a) => a.reduce((bi, v, i) => (v > a[bi] ? i : bi), 0)
const maxAbsDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0)
const pct = (xs, p) => { if (!xs.length) return NaN; const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] }

// ---------- browser ----------
const gpuArgs = process.platform === 'darwin' && !process.env.SMARTWEB_SOFTWARE_GL ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : []
const videoDir = join(OUT, 'video-tmp')
rmSync(videoDir, { recursive: true, force: true })
const browser = await chromium.launch({ headless: true, args: gpuArgs })
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: process.env.NO_VIDEO ? undefined : { dir: videoDir, size: { width: 960, height: 600 } },
})
const page = await context.newPage()
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

const hook = (fn, arg) => page.evaluate(fn, arg)
await page.goto(BASE + '/')
await page.waitForFunction(() => {
  const b = document.querySelector('[data-testid=replay-journey]')
  return !!window.__smartweb && !!b && !b.disabled
}, null, { timeout: 30000 })
await hook(() => window.__smartweb.reset())
await hook(() => window.__smartweb.idle())
const netSource = await hook(() => window.__smartweb.netSource())
const glRenderer = await hook(() => {
  const gl = document.createElement('canvas').getContext('webgl')
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info')
  return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no webgl'
})

// ---------- sampling ----------
async function sample() {
  return hook(() => {
    const h = window.__smartweb
    const gridBoxes = {}
    for (const el of document.querySelectorAll('[data-testid=adaptive-grid] > [data-grid-action]')) {
      const r = el.getBoundingClientRect()
      gridBoxes[el.getAttribute('data-grid-action')] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
    }
    const sugg = [...document.querySelectorAll('[data-testid=suggestion-item]')].map((e) => e.getAttribute('data-action'))
    return {
      stats: h.stats(), ranking: h.ranking(), css: h.cssOutputs(), js: h.jsOutputs(), latencies: h.latencies(),
      features: h.features(), markov: h.markov(), blended: h.blended(), alpha: h.alpha(), gridOrder: h.gridOrder(),
      domSuggestions: sugg, gridBoxes, scrollY: Math.round(window.scrollY),
      compact: !!document.querySelector('[data-testid=adaptive-grid] .text-sm'),
    }
  })
}

// ---------- human-ish input ----------
let pos = { x: 640, y: 120 }
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** Eased multi-step move with perpendicular jitter and an optional overshoot-and-correct. */
async function moveTo(tx, ty, { ms = 220, jitter = 6, overshoot = 0 } = {}) {
  const sx = pos.x, sy = pos.y
  const dx = tx - sx, dy = ty - sy
  const dist = Math.hypot(dx, dy) || 1
  const nx = -dy / dist, ny = dx / dist
  const ox = tx + (dx / dist) * overshoot, oy = ty + (dy / dist) * overshoot
  const steps = Math.max(4, Math.round(ms / 12))
  const phase = U(0, Math.PI * 2), waves = U(1, 3)
  const t0 = Date.now()
  for (let k = 1; k <= steps; k++) {
    const f = easeInOut(k / steps)
    const wob = Math.sin(phase + f * Math.PI * waves) * jitter * (1 - f) + gauss() * jitter * 0.25
    await page.mouse.move(sx + (ox - sx) * f + nx * wob, sy + (oy - sy) * f + ny * wob)
    const due = t0 + (ms * k) / steps - Date.now()
    if (due > 1) await page.waitForTimeout(due)
  }
  if (overshoot) {
    const cs = I(2, 4)
    for (let k = 1; k <= cs; k++) {
      await page.mouse.move(ox + (tx - ox) * (k / cs) + gauss(), oy + (ty - oy) * (k / cs) + gauss())
      await page.waitForTimeout(I(10, 25))
    }
  }
  pos = { x: tx, y: ty }
}

async function boxOf(testId) {
  const loc = page.locator(`[data-testid="${testId}"]`).first()
  return loc.boundingBox()
}

/** What the pointer would hit right now at (x, y). */
const hitAt = (x, y) => hook(([x, y]) => {
  const el = document.elementFromPoint(x, y)
  const a = el && el.closest('[data-testid^="action-"], [data-testid="suggestion-item"]')
  if (!a) return el ? `other:${el.tagName.toLowerCase()}` : 'none'
  return a.getAttribute('data-testid') === 'suggestion-item' ? `suggestion:${a.getAttribute('data-action')}` : a.getAttribute('data-testid').slice(7)
}, [x, y])

const T_START = Date.now()
const trace = []
const notes = []
const shots = []
let lastSample = await sample()
const coldSample = lastSample
let shotBudget = { misclick: 3, moved: 3, burstMove: 2, diff: 2 }
async function shot(name, why) {
  const file = `${String(shots.length).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: join(OUT, file) })
  shots.push({ file, why, at: trace.length })
  return file
}
await shot('cold-start', 'after reset, before any interaction')

let firstCorrectIdx = null, firstLearnedCorrectIdx = null, firstGridMoveIdx = null
let mode = 'calc'

/**
 * One interaction. `kind` is the persona state (calm|rage|angry-toggle|nav-bounce|...).
 * In a burst (`inPlace`) the pointer does not re-aim: rage clicks land where the
 * pointer already is, even if the layout moved under it.
 */
async function interact(intended, { kind = 'normal', pressMs, dwellMs, approachMs, inPlace = false, viaSuggestion = false, gapMs = 0 } = {}) {
  const pre = lastSample
  const testId = viaSuggestion ? null : `action-${intended}`
  let b0 = null, tx = pos.x, ty = pos.y
  if (!inPlace) {
    if (viaSuggestion) {
      const loc = page.locator(`[data-testid=suggestion-item][data-action="${intended}"]`).first()
      b0 = await loc.boundingBox()
    } else b0 = await boxOf(testId)
    if (!b0) throw new Error(`no box for ${intended}`)
    // Rushed people aim sloppily: land anywhere in the inner 70% of the target.
    tx = b0.x + b0.width * U(0.15, 0.85)
    ty = b0.y + b0.height * U(0.2, 0.8)
    await moveTo(tx, ty, { ms: approachMs ?? U(140, 320), jitter: U(3, 10), overshoot: chance(0.45) ? U(8, 28) : 0 })
  }
  if (dwellMs) {
    // tremor while hovering
    const end = Date.now() + dwellMs
    while (Date.now() < end) { await page.mouse.move(tx + gauss() * 1.5, ty + gauss() * 1.5); await page.waitForTimeout(16) }
    await page.mouse.move(tx, ty)
  }
  // Did the target move between the start of the approach and the press?
  let movedPx = 0
  if (b0 && testId) {
    const b1 = await boxOf(testId)
    if (b1) movedPx = Math.round(Math.hypot(b1.x - b0.x, b1.y - b0.y))
  }
  const hit = await hitAt(tx, ty)
  const before = pre.stats.examples
  const tPress = Date.now()
  await page.mouse.down()
  await page.waitForTimeout(pressMs ?? U(35, 110))
  await page.mouse.up()
  // Wait for the training step (or give up: a press that hit nothing learnable).
  let s = null
  const deadline = Date.now() + 1500
  while (Date.now() < deadline) {
    const ex = await hook(() => window.__smartweb.stats().examples)
    if (ex > before) break
    await page.waitForTimeout(5)
  }
  await hook(() => window.__smartweb.idle())
  s = await sample()
  const learned = s.stats.examples > before
  const oneHot = s.features.slice(7, 15)
  const actual = learned ? ACTIONS[argmax(oneHot)] : null

  // prediction for this interaction = state before it
  const pMarkov = ACTIONS[argmax(pre.markov)]
  const pMlp = pre.css.length ? ACTIONS[argmax(pre.css)] : null
  const pTop = pre.ranking[0]
  const learnedRow = maxAbsDiff(pre.markov, PRIOR) > 0.01
  const gridChanged = pre.gridOrder.join() !== s.gridOrder.join()
  const displaced = pre.gridOrder.filter((a, i) => a !== s.gridOrder[i]).length
  const diff = s.css.length ? maxAbsDiff(s.css, s.js) : NaN
  const rec = {
    i: trace.length, tMs: tPress - T_START, kind, intended, hit, actual, learned, mode,
    viaSuggestion, inPlace, movedPx,
    pred: { top: pTop, markov: pMarkov, mlp: pMlp, learnedRow, sugg: pre.domSuggestions },
    gridChanged, displaced, gridOrderBefore: pre.gridOrder, cssJsMaxDiff: diff,
    sample: s,
  }
  trace.push(rec)
  lastSample = s

  // ---- live detection of notable moments ----
  if (actual && pTop === actual && pre.stats.examples > 0 && firstCorrectIdx === null) firstCorrectIdx = rec.i
  if (actual && pTop === actual && learnedRow && firstLearnedCorrectIdx === null) {
    firstLearnedCorrectIdx = rec.i
    notes.push({ i: rec.i, what: `first learned correct top suggestion: predicted ${pTop} and the persona did ${actual}`, shot: await shot('first-correct-suggestion', 'first time the top suggestion (from a learned Markov row) matched the next action') })
  }
  if (gridChanged && firstGridMoveIdx === null) {
    firstGridMoveIdx = rec.i
    notes.push({ i: rec.i, what: `first grid reorder: ${pre.gridOrder.join(',')} -> ${s.gridOrder.join(',')}`, shot: await shot('first-grid-move', 'first adaptive-grid reorder') })
  }
  if (testId && hit !== intended && !hit.startsWith('suggestion:')) {
    const n = { i: rec.i, what: `misclick: aimed at ${intended}, pointer was over ${hit}, model learned ${actual}` }
    if (shotBudget.misclick-- > 0) n.shot = await shot(`misclick-${rec.i}`, n.what)
    notes.push(n)
  }
  if (movedPx > 8) {
    const n = { i: rec.i, what: `target ${intended} moved ${movedPx}px during the ${kind} approach` }
    if (shotBudget.moved-- > 0) n.shot = await shot(`target-moved-${rec.i}`, n.what)
    notes.push(n)
  }
  if (inPlace && gridChanged) {
    const n = { i: rec.i, what: `grid reordered during a rage burst (${pre.gridOrder.join(',')} -> ${s.gridOrder.join(',')}); next in-place click lands on whatever is now under the pointer` }
    if (shotBudget.burstMove-- > 0) n.shot = await shot(`burst-grid-move-${rec.i}`, n.what)
    notes.push(n)
  }
  if (diff > 1e-3) {
    const n = { i: rec.i, what: `CSS vs JS diff ${diff}` }
    if (shotBudget.diff-- > 0) n.shot = await shot(`diff-${rec.i}`, n.what)
    notes.push(n)
  }
  const elapsed = Date.now() - tPress
  if (gapMs > elapsed) await page.waitForTimeout(gapMs - elapsed)
  return rec
}

const think = (a = 300, b = 1200) => page.waitForTimeout(I(a, b))

async function jerkyScroll() {
  const n = I(3, 7)
  for (let k = 0; k < n; k++) {
    await page.mouse.wheel(0, (k % 2 ? -1 : 1) * U(120, 520))
    await page.waitForTimeout(I(30, 90))
  }
  await page.mouse.wheel(0, -2000) // back to top, impatiently
  await page.waitForTimeout(I(80, 200))
}

async function rageBurst(action, n) {
  // first press aimed (fast), the rest in place: short presses, short gaps
  const recs = [await interact(action, { kind: 'rage', approachMs: U(90, 160), pressMs: U(25, 60), gapMs: U(90, 160) })]
  for (let k = 1; k < n; k++) {
    if (chance(0.5)) await page.mouse.move(pos.x + gauss() * 3, pos.y + gauss() * 3)
    recs.push(await interact(action, { kind: 'rage', inPlace: true, pressMs: U(20, 55), gapMs: U(80, 170) }))
  }
  return recs
}

async function angrySearch() {
  await interact('search', { kind: 'normal' })
  const words = ['basalt', 'moss garden', 'night sky', 'recipes', 'typography']
  const word = words[I(0, words.length - 1)]
  for (const ch of word) {
    if (chance(0.15)) { // fat-finger then fix it
      await page.keyboard.type(String.fromCharCode(97 + I(0, 25)), { delay: 0 })
      await page.waitForTimeout(I(40, 120))
      await page.keyboard.press('Backspace')
    }
    await page.keyboard.type(ch, { delay: 0 })
    await page.waitForTimeout(I(35, 170))
  }
  if (chance(0.4)) { // rage-delete and retype
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(I(150, 400))
    await page.keyboard.type(word.slice(0, 4), { delay: I(40, 90) })
  }
  await page.keyboard.press('Enter')
  await page.waitForTimeout(I(150, 400))
}

async function setEngine(m) {
  const b = await boxOf('mode-select')
  await moveTo(b.x + b.width / 2, b.y + b.height / 2, { ms: 180, jitter: 6 })
  await page.selectOption('[data-testid=mode-select]', m)
  mode = m
  await page.waitForTimeout(400)
  await hook(() => window.__smartweb.idle())
  lastSample = await sample()
  notes.push({ i: trace.length, what: `persona switched Engine to ${m} (netSource ${await hook(() => window.__smartweb.netSource())})` })
}

// ---------- the session ----------
let firstRageShot = false
for (let c = 0; c < CYCLES; c++) {
  if (c === Math.floor(CYCLES * 0.55)) await setEngine('hybrid')
  if (c === Math.floor(CYCLES * 0.8)) await setEngine('animation')

  // 1) get to Explore, sometimes bouncing between views first
  if (chance(0.3)) {
    await interact('nav-library', { kind: 'nav-bounce' }); await think(150, 500)
    await interact('nav-explore', { kind: 'nav-bounce' }); await think(150, 400)
    if (chance(0.4)) { await interact('nav-library', { kind: 'nav-bounce' }); await think(100, 300); await interact('nav-explore', { kind: 'nav-bounce' }) }
  } else {
    await interact('nav-explore', { kind: 'normal' })
  }
  await think(300, 900)
  if (chance(0.35)) { await jerkyScroll() }

  // 2) open a card. Frustration: nothing visible happens -> rage burst
  const rage = chance(0.42)
  if (rage) {
    const recs = await rageBurst('open-card', I(3, 6))
    if (!firstRageShot) { firstRageShot = true; notes.push({ i: recs.at(-1).i, what: `first rage burst (${recs.length} presses on Open)`, shot: await shot('first-rage-burst', 'right after the first rage burst') }) }
    // 3a) angry Compact-mode toggling, then give up and go Home
    await think(80, 250)
    const toggles = I(2, 3)
    await interact('settings', { kind: 'angry-toggle', approachMs: U(100, 180), pressMs: U(25, 60), gapMs: U(120, 250) })
    for (let k = 1; k < toggles; k++) await interact('settings', { kind: 'angry-toggle', inPlace: true, pressMs: U(25, 60), gapMs: U(120, 250) })
    await think(150, 500)
    await interact('nav-home', { kind: 'bail' })
  } else {
    // calm-ish (for this persona): still short presses, but no burst
    await interact('open-card', { kind: 'calm', dwellMs: I(60, 200), pressMs: U(70, 140) })
    await think(500, 1400)
    // 3b) favourite it; if the suggestion panel already proposes Favorite, use it now and then
    const viaSugg = lastSample.domSuggestions[0] === 'favorite' && chance(0.35)
    await interact('favorite', { kind: 'calm', viaSuggestion: viaSugg, dwellMs: I(40, 160) })
    await think(300, 1000)
    if (chance(0.6)) await interact('share', { kind: 'normal' })
    else await angrySearch()
    await think(300, 900)
    await interact('nav-home', { kind: 'normal' })
  }
  await think(400, 1200)
  if (c === Math.floor(CYCLES / 2)) notes.push({ i: trace.length - 1, what: 'mid-session', shot: await shot('mid-session', 'half way, calc engine') })
}
// Debug drawer open for the final shot so the numbers are visible
const dbg = await boxOf('debug-toggle')
await moveTo(dbg.x + dbg.width / 2, dbg.y + dbg.height / 2, { ms: 200 })
await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up()
await page.waitForTimeout(500)
notes.push({ i: trace.length - 1, what: 'end of session', shot: await shot('end', 'end of session with debug drawer open') })
await page.screenshot({ path: join(OUT, `${String(shots.length).padStart(2, '0')}-end-full.png`), fullPage: true })
shots.push({ file: `${String(shots.length).padStart(2, '0')}-end-full.png`, why: 'end, full page', at: trace.length })

const finalSample = await sample()
const latDoubleRaf = await hook(() => window.__smartweb.latenciesDoubleRaf())
await page.close()
await context.close()
await browser.close()
// keep one video, named
try {
  const vids = readdirSync(videoDir).filter((f) => f.endsWith('.webm'))
  if (vids[0]) renameSync(join(videoDir, vids[0]), join(OUT, 'session.webm'))
  rmSync(videoDir, { recursive: true, force: true })
} catch { /* no video */ }

// ---------- metrics ----------
// Reconstruct every latency sample from the rolling (last 100) latencies() arrays.
const allLat = []
let prev = coldSample.latencies
allLat.push(...prev)
for (const r of trace) {
  const cur = r.sample.latencies
  let d = 0
  while (d < prev.length && !prev.slice(d).every((v, k) => v === cur[k])) d++
  allLat.push(...cur.slice(prev.length - d))
  prev = cur
}
const latByMode = {}
{ // attribute latency samples to modes by replaying the same reconstruction per interaction
  let p = coldSample.latencies
  for (const r of trace) {
    const cur = r.sample.latencies
    let d = 0
    while (d < p.length && !p.slice(d).every((v, k) => v === cur[k])) d++
    ;(latByMode[r.mode] ??= []).push(...cur.slice(p.length - d))
    p = cur
  }
}
const learnedRecs = trace.filter((r) => r.actual)
const hitRate = (rs, key) => rs.length ? rs.filter((r) => r.pred[key] === r.actual).length / rs.length : NaN
const windows = []
for (let k = 0; k < learnedRecs.length; k += 25) {
  const w = learnedRecs.slice(k, k + 25)
  windows.push({ from: w[0].i, to: w.at(-1).i, n: w.length, top: hitRate(w, 'top'), markov: hitRate(w, 'markov'), mlp: hitRate(w, 'mlp') })
}
// Intensity: predictions made right after an open-card press, split by how it was pressed.
const afterOpen = trace.filter((r, k) => k > 0 && trace[k - 1].actual === 'open-card' && r.actual)
const half = Math.floor(trace.length / 2)
const ctx = (r) => trace[r.i - 1].kind // 'rage' or 'calm'
function intensitySplit(rs) {
  const g = { calm: [], rage: [] }
  for (const r of rs) { const k = ctx(r); if (g[k]) g[k].push(r) }
  const desc = (xs) => {
    if (!xs.length) return null
    const nextCounts = {}
    xs.forEach((r) => { nextCounts[r.actual] = (nextCounts[r.actual] ?? 0) + 1 })
    const mean = (f) => xs.reduce((s, r) => s + f(r), 0) / xs.length
    const pre = (r) => trace[r.i - 1].sample
    const ix = (a) => ACTIONS.indexOf(a)
    return {
      n: xs.length, nextCounts,
      topAcc: hitRate(xs, 'top'), markovAcc: hitRate(xs, 'markov'), mlpAcc: hitRate(xs, 'mlp'),
      meanMlp: { favorite: mean((r) => pre(r).css[ix('favorite')]), openCard: mean((r) => pre(r).css[ix('open-card')]), settings: mean((r) => pre(r).css[ix('settings')]) },
      meanMarkov: { favorite: mean((r) => pre(r).markov[ix('favorite')]), openCard: mean((r) => pre(r).markov[ix('open-card')]), settings: mean((r) => pre(r).markov[ix('settings')]) },
      topCounts: xs.reduce((m, r) => { m[r.pred.top] = (m[r.pred.top] ?? 0) + 1; return m }, {}),
      mlpTopCounts: xs.reduce((m, r) => { m[r.pred.mlp] = (m[r.pred.mlp] ?? 0) + 1; return m }, {}),
      burstFeatureMean: mean((r) => pre(r).features[6]), pressFeatureMean: mean((r) => pre(r).features[0]),
    }
  }
  return { calm: desc(g.calm), rage: desc(g.rage) }
}
const gridMoves = trace.filter((r) => r.gridChanged)
const misclicks = trace.filter((r) => !r.viaSuggestion && r.hit !== r.intended)
const wrongLearned = trace.filter((r) => r.actual && r.actual !== r.intended)
// layout shift of grid cards not caused by reorder (compact toggles)
let resizeShifts = 0
for (let k = 1; k < trace.length; k++) {
  const a = trace[k - 1].sample.gridBoxes, b = trace[k].sample.gridBoxes
  if (!trace[k].gridChanged && Object.keys(a).some((key) => b[key] && Math.hypot(a[key][0] - b[key][0], a[key][1] - b[key][1]) > 4)) resizeShifts++
}
// rolling stats from the app
const appAcc = trace.map((r) => ({ i: r.i, markov: r.sample.stats.markovAcc, mlp: r.sample.stats.mlpAcc, examples: r.sample.stats.examples, alpha: r.sample.alpha }))
const maxDiff = Math.max(...trace.map((r) => r.cssJsMaxDiff).filter((v) => Number.isFinite(v)))
const maxDiffByMode = {}
for (const r of trace) if (Number.isFinite(r.cssJsMaxDiff)) maxDiffByMode[r.mode] = Math.max(maxDiffByMode[r.mode] ?? 0, r.cssJsMaxDiff)
const interMoveGaps = gridMoves.slice(1).map((r, k) => r.i - gridMoves[k].i)

const metrics = {
  seed: SEED, cycles: CYCLES, netSource, glRenderer, durationS: (Date.now() - T_START) / 1000,
  interactions: trace.length, learnedInteractions: learnedRecs.length, finalExamples: finalSample.stats.examples,
  firstCorrectIdx, firstLearnedCorrectIdx, firstGridMoveIdx,
  firstAdaptationAtInteraction: Math.min(...[firstLearnedCorrectIdx, firstGridMoveIdx].filter((v) => v !== null)),
  finalAppStats: finalSample.stats, finalAlpha: finalSample.alpha,
  accuracyWindows25: windows,
  overallTop1: { top: hitRate(learnedRecs, 'top'), markov: hitRate(learnedRecs, 'markov'), mlp: hitRate(learnedRecs, 'mlp') },
  lastHalfTop1: (() => { const rs = learnedRecs.filter((r) => r.i >= half); return { top: hitRate(rs, 'top'), markov: hitRate(rs, 'markov'), mlp: hitRate(rs, 'mlp'), n: rs.length } })(),
  intensityAfterOpenCard: { all: intensitySplit(afterOpen), lastHalf: intensitySplit(afterOpen.filter((r) => r.i >= half)) },
  latency: { n: allLat.length, p50: pct(allLat, 50), p95: pct(allLat, 95), max: Math.max(...allLat), byMode: Object.fromEntries(Object.entries(latByMode).map(([m, xs]) => [m, { n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), max: Math.max(...xs) }])) },
  latencyDoubleRafLast100: { p50: pct(latDoubleRaf, 50), p95: pct(latDoubleRaf, 95) },
  cssJsMaxAbsDiff: maxDiff, cssJsMaxAbsDiffByMode: maxDiffByMode,
  layout: {
    gridMoves: gridMoves.length, displacedSlotsTotal: gridMoves.reduce((s, r) => s + r.displaced, 0),
    gridMovesDuringBursts: gridMoves.filter((r) => r.inPlace || r.kind === 'rage').length,
    gridMovesByKind: gridMoves.reduce((m, r) => { m[r.kind] = (m[r.kind] ?? 0) + 1; return m }, {}),
    maxMovesInAnyWindow10: Math.max(0, ...trace.map((_, k) => trace.slice(k, k + 10).filter((r) => r.gridChanged).length)),
    medianGapBetweenMoves: interMoveGaps.length ? pct(interMoveGaps, 50) : null,
    moreThanOneElementMovedPerInteraction: gridMoves.filter((r) => {
      const a = r.gridOrderBefore, b = r.sample.gridOrder
      return !a.some((m) => { const ra = a.filter((v) => v !== m), rb = b.filter((v) => v !== m); return ra.every((v, i) => v === rb[i]) })
    }).length,
    targetMovedDuringApproach: trace.filter((r) => r.movedPx > 8).length,
    compactResizeShifts: resizeShifts,
  },
  misclicks: misclicks.map((r) => ({ i: r.i, kind: r.kind, intended: r.intended, hit: r.hit, actual: r.actual })),
  wrongActionLearned: wrongLearned.map((r) => ({ i: r.i, intended: r.intended, actual: r.actual, kind: r.kind })),
  unlearnedPresses: trace.filter((r) => !r.learned).map((r) => ({ i: r.i, intended: r.intended, hit: r.hit, kind: r.kind })),
  kinds: trace.reduce((m, r) => { m[r.kind] = (m[r.kind] ?? 0) + 1; return m }, {}),
  consoleErrors,
}
writeFileSync(join(OUT, 'trace.json'), JSON.stringify({ meta: { base: BASE, seed: SEED, cycles: CYCLES, startedAt: new Date(T_START).toISOString(), viewport: [1280, 800], gpuArgs }, cold: coldSample, interactions: trace, appAcc, final: finalSample, latDoubleRaf, notes, shots }, null, 0))
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify({ metrics, notes, shots }, null, 2))
console.log(JSON.stringify(metrics, null, 2))
console.log('NOTES', JSON.stringify(notes, null, 1))
