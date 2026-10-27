// Live-session driver, persona "methodical".
// Stable routine home -> explore -> open-card -> favorite -> share, calm precise presses,
// long hover dwell, think-time pauses, occasional deviations (search with typing,
// library, compact-mode toggle, skipped favorite), a few scrolls, one reload mid-session.
// Run from the repo root:  node reports/sessions/methodical/session.mjs
// Env: BASE (default http://127.0.0.1:5181), N (min interactions, default 125), SEED, VIDEO=0 to skip video.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE ?? 'http://127.0.0.1:5181'
const N = Number(process.env.N ?? 125)
const SEED = Number(process.env.SEED ?? 20261022)
const ACTIONS = ['nav-home', 'nav-explore', 'nav-library', 'search', 'open-card', 'favorite', 'share', 'settings']
const ROUTINE = ['nav-home', 'nav-explore', 'open-card', 'favorite', 'share']

// ---------- seeded randomness ----------
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const rnd = mulberry32(SEED)
const U = (a, b) => a + (b - a) * rnd()
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return s - 3 } // ~N(0,0.7)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const argmax = (a) => a.reduce((bi, v, i) => (v > a[bi] ? i : bi), 0)

// ---------- browser ----------
const gpuArgs = process.platform === 'darwin' && !process.env.SMARTWEB_SOFTWARE_GL ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : []
const browser = await chromium.launch({ headless: true, args: gpuArgs })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push({ t: Date.now(), type: m.type(), text: m.text().slice(0, 400) }) })
page.on('pageerror', (e) => consoleErrors.push({ t: Date.now(), type: 'pageerror', text: String(e).slice(0, 400) }))

const ready = () => page.waitForFunction(() => {
  const b = document.querySelector('[data-testid=replay-journey]')
  return !!window.__smartweb && !!b && !b.disabled
}, null, { timeout: 30000 })

await page.goto(BASE + '/')
await ready()
await page.evaluate(() => window.__smartweb.reset())
await page.evaluate(() => window.__smartweb.idle())
const glRenderer = await page.evaluate(() => {
  try { const c = document.createElement('canvas').getContext('webgl'); const e = c.getExtension('WEBGL_debug_renderer_info'); return c.getParameter(e.UNMASKED_RENDERER_WEBGL) } catch { return 'unknown' }
})

const sample = () => page.evaluate(() => {
  const h = window.__smartweb
  return {
    stats: h.stats(), ranking: h.ranking(), css: h.cssOutputs(), js: h.jsOutputs(), latencies: h.latencies(),
    latDouble: h.latenciesDoubleRaf(), markov: h.markov(), blended: h.blended(), alpha: h.alpha(), grid: h.gridOrder(),
    netSource: h.netSource(), features: h.features(),
    domGrid: [...document.querySelectorAll('[data-testid=adaptive-grid] > [data-grid-action]')].map((e) => e.getAttribute('data-grid-action')),
    domSuggest: [...document.querySelectorAll('[data-testid=suggestion-item]')].map((e) => e.getAttribute('data-action')),
  }
})

// ---------- human motion ----------
let mouse = { x: 640, y: 400 }
async function moveTo(tx, ty, { slow = 1 } = {}) {
  const sx = mouse.x, sy = mouse.y
  const dist = Math.hypot(tx - sx, ty - sy)
  const steps = Math.round(clamp(dist / 14, 14, 48) * slow)
  // curved path: quadratic bezier with a perpendicular control offset
  const nx = -(ty - sy) / (dist || 1), ny = (tx - sx) / (dist || 1)
  const bend = U(-0.12, 0.12) * dist
  const cx = (sx + tx) / 2 + nx * bend, cy = (sy + ty) / 2 + ny * bend
  // calm user: slight overshoot then correct, sometimes
  const overshoot = rnd() < 0.25 ? U(3, 8) : 0
  const ex = tx + ((tx - sx) / (dist || 1)) * overshoot, ey = ty + ((ty - sy) / (dist || 1)) * overshoot
  for (let k = 1; k <= steps; k++) {
    const t = easeInOut(k / steps)
    const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * ex
    const y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ey
    await page.mouse.move(x, y)
    await sleep(U(9, 17))
  }
  if (overshoot) { for (let k = 1; k <= 5; k++) { await page.mouse.move(ex + (tx - ex) * k / 5, ey + (ty - ey) * k / 5); await sleep(U(14, 24)) } }
  mouse = { x: tx, y: ty }
}

const box = (sel) => page.locator(sel).first().boundingBox()
async function stableBox(sel) {
  let prev = await box(sel), still = 0
  for (let i = 0; i < 90; i++) {
    await sleep(16)
    const b = await box(sel)
    if (b && prev && Math.abs(b.x - prev.x) < 0.3 && Math.abs(b.y - prev.y) < 0.3) { if (++still >= 4) return b } else still = 0
    prev = b
  }
  return prev
}
const selFor = (a) => `[data-testid="action-${a}"]`

const events = [] // weirdness log
async function waitExamples(before, timeout = 4000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const n = await page.evaluate(() => window.__smartweb.stats().examples)
    if (n > before) return n
    await sleep(20)
  }
  return null
}

/** Approach target calmly, dwell, re-check it did not move, press. Returns details. */
async function calmPress(sel, { pressMs = U(140, 260), dwellMs = U(380, 900) } = {}) {
  const b0 = await stableBox(sel)
  if (!b0) throw new Error('no box for ' + sel)
  const tx = b0.x + b0.width * U(0.35, 0.65), ty = b0.y + b0.height * U(0.35, 0.65)
  await moveTo(tx, ty)
  // dwell with tiny hand tremor (precise user: <=1px)
  const dEnd = Date.now() + dwellMs
  while (Date.now() < dEnd) { await page.mouse.move(tx + U(-0.8, 0.8), ty + U(-0.8, 0.8)); await sleep(U(60, 140)) }
  await page.mouse.move(tx, ty)
  const b1 = await box(sel)
  const movedUnderPointer = !!(b1 && (Math.abs(b1.x - b0.x) > 2 || Math.abs(b1.y - b0.y) > 2))
  let px = tx, py = ty
  if (movedUnderPointer) {
    // A careful human notices the target moved and re-aims.
    const b2 = await stableBox(sel)
    px = b2.x + b2.width / 2; py = b2.y + b2.height / 2
    await moveTo(px, py, { slow: 0.7 }); await sleep(U(250, 450))
  }
  await page.mouse.down(); await sleep(pressMs); await page.mouse.up()
  return { pressMs: Math.round(pressMs), dwellMs: Math.round(dwellMs), movedUnderPointer, at: [Math.round(px), Math.round(py)] }
}

async function typeLikeHuman(text) {
  for (const ch of text) { await page.keyboard.type(ch); await sleep(clamp(150 + gauss() * 40, 90, 260)) }
}

async function scrollAround() {
  const dir = rnd() < 0.5 ? 1 : -1
  for (let k = 0; k < Math.round(U(3, 7)); k++) { await page.mouse.wheel(0, dir * U(60, 140)); await sleep(U(40, 90)) }
  await sleep(U(300, 700))
  for (let k = 0; k < Math.round(U(2, 5)); k++) { await page.mouse.wheel(0, -dir * U(60, 140)); await sleep(U(40, 90)) }
}

// ---------- one interaction ----------
const trace = []
let screenshotsTaken = {}
async function shot(name, why) {
  const p = join(OUT, name + '.png')
  await page.screenshot({ path: p, fullPage: false })
  screenshotsTaken[name] = why
  console.log(`  [shot] ${name}.png — ${why}`)
}

async function doAction(action, { viaSuggestion = false, kind = 'routine' } = {}) {
  const pre = await sample()
  const before = pre.stats.examples
  let detail = {}
  const tStart = Date.now()
  if (action === 'search') {
    // Click the field (the app counts the click as a search), type a query, press Enter.
    detail = await calmPress(selFor('search'), { pressMs: U(110, 180) })
    await sleep(U(300, 600))
    await page.keyboard.press('ControlOrMeta+a').catch(() => {})
    await typeLikeHuman(['basalt', 'moss', 'timelapse', 'field notes'][Math.floor(rnd() * 4)])
    await sleep(U(400, 900))
    await page.keyboard.press('Enter')
    await sleep(400)
    // click away from the field (calm user moves the pointer back to neutral space)
    await moveTo(U(900, 1100), U(700, 760))
  } else if (viaSuggestion) {
    const sel = `[data-testid="suggestion-item"][data-action="${action}"]`
    detail = await calmPress(sel)
  } else {
    detail = await calmPress(selFor(action))
  }
  let after = await waitExamples(before)
  if (after === null) {
    events.push({ i: trace.length, type: 'missed-click', action, detail })
    console.log(`  !! click on ${action} did not register; retrying`)
    detail.retried = true
    detail.retry = await calmPress(viaSuggestion ? `[data-testid="suggestion-item"][data-action="${action}"]` : selFor(action))
    after = await waitExamples(before)
  }
  await page.evaluate(() => window.__smartweb.idle())
  // let the latency measurement land (rAF + message after commit)
  const latLenBefore = pre.latencies.length
  for (let k = 0; k < 20; k++) { const n = await page.evaluate(() => window.__smartweb.latencies().length); if (n !== latLenBefore || n === 100) break; await sleep(16) }
  await sleep(50)
  const post = await sample()
  const examplesAdded = post.stats.examples - before
  if (examplesAdded > 1) events.push({ i: trace.length, type: 'multiple-examples', action, examplesAdded })
  const pred = {
    suggestTop: pre.domSuggest[0], blendTop: pre.ranking[0],
    markovTop: ACTIONS[argmax(pre.markov)], mlpTop: pre.css.length ? ACTIONS[argmax(pre.css)] : null,
    rankOfActual: pre.ranking.indexOf(action),
  }
  const gridChanged = JSON.stringify(pre.grid) !== JSON.stringify(post.grid)
  const domGridChanged = JSON.stringify(pre.domGrid) !== JSON.stringify(post.domGrid)
  const maxDiff = post.css.length && post.js.length ? post.css.reduce((m, v, i) => Math.max(m, Math.abs(v - post.js[i])), 0) : NaN
  const rec = {
    i: trace.length, action, kind, viaSuggestion, wallMs: Date.now() - tStart, detail, examplesAdded,
    pred, correct: { suggest: pred.suggestTop === action, markov: pred.markovTop === action, mlp: pred.mlpTop === action },
    gridBefore: pre.grid, gridAfter: post.grid, gridChanged, domGridChanged,
    latency: post.latencies.length ? post.latencies[post.latencies.length - 1] : null,
    latencyNew: post.latencies.length !== pre.latencies.length || JSON.stringify(post.latencies.slice(-3)) !== JSON.stringify(pre.latencies.slice(-3)),
    latDouble: post.latDouble.length ? post.latDouble[post.latDouble.length - 1] : null,
    cssJsMaxDiff: maxDiff,
    post: { stats: post.stats, ranking: post.ranking, css: post.css, js: post.js, markov: post.markov, blended: post.blended, alpha: post.alpha, netSource: post.netSource, features: post.features, suggest: post.domSuggest },
  }
  trace.push(rec)
  const c = rec.correct
  console.log(`#${String(rec.i).padStart(3)} ${action.padEnd(11)} ${kind.padEnd(9)} sug:${(pred.suggestTop ?? '').padEnd(11)}${c.suggest ? '✓' : ' '} mk:${c.markov ? '✓' : ' '} mlp:${c.mlp ? '✓' : ' '} grid:${gridChanged ? 'MOVED ' + post.grid.join(',') : '-'} lat:${rec.latency?.toFixed(1)} acc(m/n)=${post.stats.markovAcc.toFixed(2)}/${post.stats.mlpAcc.toFixed(2)} α=${post.alpha.toFixed(2)}${detail.movedUnderPointer ? ' MOVED-UNDER-POINTER' : ''}`)
  return rec
}

// ---------- session plan ----------
await page.mouse.move(mouse.x, mouse.y)
await shot('01-cold-start', 'fresh model after reset, before any interaction')
const coldGrid = (await sample()).grid
let firstAdaptShot = false, reloadDone = false, weirdShots = 0
let cycle = 0
while (trace.length < N) {
  cycle++
  // build this cycle's step list
  let steps = [...ROUTINE]
  const r = rnd()
  let deviation = null
  if (cycle > 2 && r < 0.07) { deviation = 'search'; steps.splice(3, 0, 'search') }           // look something up after opening
  else if (cycle > 2 && r < 0.12) { deviation = 'library'; steps.splice(2, 0, 'nav-library') } // detour to library
  else if (cycle > 2 && r < 0.16) { deviation = 'settings'; steps.push('settings') }           // toggle compact mode
  else if (cycle > 2 && r < 0.20) { deviation = 'skip-fav'; steps = steps.filter((s) => s !== 'favorite') }
  if (deviation) console.log(`-- cycle ${cycle}: deviation ${deviation}`)
  for (const a of steps) {
    if (trace.length >= N && a === 'nav-home') break
    const kind = ROUTINE.includes(a) && !(deviation === 'skip-fav' && a === 'share') ? 'routine' : 'deviation'
    // Once the suggestion has been right a lot, the methodical user sometimes takes the shortcut.
    const recent = trace.slice(-10)
    const trust = recent.length === 10 && recent.filter((t) => t.correct.suggest).length >= 9
    const pre = trust ? await page.evaluate(() => window.__smartweb.ranking()[0]) : null
    const viaSuggestion = trust && pre === a && a !== 'search' && rnd() < 0.2
    const rec = await doAction(a, { viaSuggestion, kind })
    if (!firstAdaptShot && (rec.gridChanged || (rec.correct.suggest && rec.pred.suggestTop !== trace[0].pred.suggestTop))) {
      firstAdaptShot = true
      await shot('02-first-adaptation', `interaction #${rec.i}: ${rec.gridChanged ? 'grid reordered' : 'suggestion top predicted the action'}`)
    }
    if (rec.detail.movedUnderPointer && weirdShots < 3) { weirdShots++; await shot(`weird-moved-under-pointer-${rec.i}`, `target ${a} moved while hovering`) }
    if (rec.examplesAdded > 1 && weirdShots < 3) { weirdShots++; await shot(`weird-double-count-${rec.i}`, `${a} produced ${rec.examplesAdded} training examples`) }
    if (rec.i === 60) await shot('03-mid-session', 'after 60 interactions')
    // think time: long after content opens, short between nav hops
    const think = a === 'open-card' ? U(1200, 2600) : a === 'nav-explore' ? U(700, 1500) : U(450, 1100)
    await sleep(think)
    if (rnd() < 0.08) await scrollAround()
  }
  // methodical user comes back "the next day" once, mid-session
  if (!reloadDone && trace.length >= 70) {
    reloadDone = true
    const s0 = await sample()
    await page.reload(); await ready(); await page.evaluate(() => window.__smartweb.idle())
    await sleep(600)
    const s1 = await sample()
    events.push({ i: trace.length, type: 'reload', before: { stats: s0.stats, grid: s0.grid, ranking: s0.ranking }, after: { stats: s1.stats, grid: s1.grid, ranking: s1.ranking } })
    console.log(`-- reload: examples ${s0.stats.examples} -> ${s1.stats.examples}, grid ${s0.grid.join(',')} -> ${s1.grid.join(',')}`)
    await shot('04-after-reload', 'after page reload at interaction ' + trace.length)
    mouse = { x: 640, y: 400 }; await page.mouse.move(mouse.x, mouse.y)
  }
}
await shot('05-end', `end of session after ${trace.length} interactions`)
// open the debug drawer for an end-state screenshot
await calmPress('[data-testid=debug-toggle]')
await sleep(500)
await page.screenshot({ path: join(OUT, '06-end-debug.png'), fullPage: true }); screenshotsTaken['06-end-debug'] = 'end state with debug drawer (full page)'
await calmPress('[data-testid=debug-toggle]')

// Parity across the other two engines on the final weights (same input).
const parity = {}
for (const m of ['calc', 'hybrid', 'animation']) {
  await page.evaluate((m) => window.__smartweb.setMode(m), m); await sleep(300)
  parity[m] = await page.evaluate(() => { const h = window.__smartweb; const c = h.cssOutputs(), j = h.jsOutputs(); return { netSource: h.netSource(), maxDiff: c.reduce((mm, v, i) => Math.max(mm, Math.abs(v - j[i])), 0) } })
}
await page.evaluate(() => window.__smartweb.setMode('calc'))

let storage = null
try { storage = await context.storageState({ indexedDB: true }) } catch (e) { events.push({ type: 'storageState-failed', err: String(e) }) }
await context.close()

// ---------- short video: the trained model, a few more routine cycles ----------
let video = null
if (process.env.VIDEO !== '0' && storage) {
  const vdir = join(OUT, 'video-tmp'); mkdirSync(vdir, { recursive: true })
  const vctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: storage, recordVideo: { dir: vdir, size: { width: 1280, height: 800 } } })
  const vpage = await vctx.newPage()
  await vpage.goto(BASE + '/')
  await vpage.waitForFunction(() => { const b = document.querySelector('[data-testid=replay-journey]'); return !!window.__smartweb && !!b && !b.disabled })
  const vstats = await vpage.evaluate(() => window.__smartweb.stats())
  let vm = { x: 640, y: 400 }
  for (const a of [...ROUTINE, ...ROUTINE]) {
    const b = await vpage.locator(selFor(a)).first().boundingBox()
    const tx = b.x + b.width / 2, ty = b.y + b.height / 2
    for (let k = 1; k <= 24; k++) { const t = easeInOut(k / 24); await vpage.mouse.move(vm.x + (tx - vm.x) * t, vm.y + (ty - vm.y) * t); await sleep(14) }
    vm = { x: tx, y: ty }
    await sleep(500); await vpage.mouse.down(); await sleep(180); await vpage.mouse.up(); await sleep(900)
  }
  await vctx.close()
  const f = readdirSync(vdir).find((x) => x.endsWith('.webm'))
  if (f) { renameSync(join(vdir, f), join(OUT, 'session-trained.webm')); video = { file: 'session-trained.webm', restoredExamples: vstats.examples } }
  rmSync(vdir, { recursive: true, force: true })
}
await browser.close()

writeFileSync(join(OUT, 'trace.json'), JSON.stringify({
  persona: 'methodical', seed: SEED, base: BASE, glRenderer, gpuArgs, viewport: [1280, 800], coldGrid,
  startedAt: new Date().toISOString(), screenshots: screenshotsTaken, events, consoleErrors, parity, video, trace,
}, null, 1))
console.log('wrote trace.json with', trace.length, 'interactions;', events.length, 'events;', consoleErrors.length, 'console errors/warnings')
