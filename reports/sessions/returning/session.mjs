// Persona "returning": one person, three browser sessions on the same persistent profile.
//   S1 (calc)          learns a morning routine: Home -> Search(type) -> Open -> Favorite -> Library
//   S2 (calc/hybrid/animation, 10 each) resumes the same routine; sometimes trusts the suggestion panel
//   S3 (animation/hybrid/calc, 15 each) changes habit: Explore -> Search(type) -> Open -> Share
// Then: export "Copy link" and open it in a brand-new profile; finally open the OLD (S1) link in the
// main profile to see what happens to the local model.
//
// Run from the repo root:  node reports/sessions/returning/session.mjs
// Needs a dev server:      npx vite --port 5184 --strictPort
import { chromium } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.SMARTWEB_URL ?? 'http://127.0.0.1:5184/'
const ACTIONS = ['nav-home', 'nav-explore', 'nav-library', 'search', 'open-card', 'favorite', 'share', 'settings']
const GPU = process.platform === 'darwin' && !process.env.SMARTWEB_SOFTWARE_GL
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : []
const VIEWPORT = { width: 1280, height: 800 }

// ---------- deterministic randomness so a rerun drives the same "person" ----------
let seed = 20261022
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const uni = (a, b) => a + (b - a) * rnd()
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
const logn = (median, sigma) => median * Math.exp(sigma * gauss())
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const argmax = (a) => a.reduce((bi, v, i) => (v > a[bi] ? i : bi), 0)
const maxAbsDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0)

// ---------- trace ----------
const trace = { meta: { base: BASE, startedAt: new Date().toISOString(), gpuArgs: GPU, viewport: VIEWPORT, seed }, interactions: [], events: [], sessions: [], portability: {} }
let gIdx = 0
const shots = []
const event = (kind, data = {}) => { const e = { kind, globalIdx: gIdx, t: Date.now(), ...data }; trace.events.push(e); console.log('[event]', kind, JSON.stringify(data).slice(0, 300)); return e }
async function shot(page, name, why) {
  const file = `${name}.png`
  await page.screenshot({ path: join(OUT, file) })
  shots.push({ file, why, globalIdx: gIdx })
  console.log('[shot]', file, '-', why)
}
const save = () => writeFileSync(join(OUT, 'trace.json'), JSON.stringify(trace, null, 1))

// ---------- page helpers ----------
async function ready(page) {
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-testid=replay-journey]')
    return !!window.__smartweb && !!b && !b.disabled
  }, null, { timeout: 30000 })
  await page.evaluate(() => window.__smartweb.idle())
}

const sample = (page) => page.evaluate(() => {
  const h = window.__smartweb
  return {
    stats: h.stats(), ranking: h.ranking(), css: h.cssOutputs(), js: h.jsOutputs(), latencies: h.latencies(),
    markov: h.markov(), blended: h.blended(), alpha: h.alpha(), netSource: h.netSource(), gridState: h.gridOrder(),
    domGrid: [...document.querySelectorAll('[data-testid=adaptive-grid] > [data-grid-action]')].map((e) => e.getAttribute('data-grid-action')),
    domSuggestions: [...document.querySelectorAll('[data-testid=suggestion-item]')].map((e) => e.getAttribute('data-action')),
    mode: document.querySelector('[data-testid=mode-select]')?.value,
  }
})

let mouse = { x: 640, y: 400 }
async function glide(page, tx, ty, steps) {
  const sx = mouse.x, sy = mouse.y
  const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy) || 1
  // curved path: quadratic bezier with a perpendicular control offset, plus slight overshoot
  const bend = uni(-0.18, 0.18) * len
  const cx = sx + dx / 2 - (dy / len) * bend, cy = sy + dy / 2 + (dx / len) * bend
  const over = uni(0, 0.04)
  for (let k = 1; k <= steps; k++) {
    const t = Math.min(1 + over, ease(k / steps) * (1 + over))
    const u = Math.min(t, 1)
    let x = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * cx + u * u * tx
    let y = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * cy + u * u * ty
    if (t > 1) { x += dx / len * (t - 1) * len * 0.5; y += dy / len * (t - 1) * len * 0.5 }
    await page.mouse.move(x, y)
    await sleep(uni(7, 17))
  }
  await page.mouse.move(tx, ty) // settle back after overshoot
  mouse = { x: tx, y: ty }
}

const selectorFor = (action, via) => (via === 'suggestion' ? `[data-testid=suggestion-item][data-action="${action}"]` : `[data-testid="action-${action}"]`)

/** Is the element under the pointer (still) the one we are aiming at? */
const underPointer = (page, x, y, sel) => page.evaluate(({ x, y, sel }) => {
  const el = document.elementFromPoint(x, y)
  const t = document.querySelector(sel)
  return !!(el && t && (t === el || t.contains(el) || el.contains(t)))
}, { x, y, sel })

const QUERIES = { s1: ['field notes', 'notes', 'field notes vol', 'typography'], s3: ['basalt', 'night sky', 'moss', 'coast'] }

/**
 * One interaction as a person does it: think, maybe scroll, look at the target (box at that
 * moment), glide there, hover, check it is still under the pointer, press, release, maybe type.
 */
async function interact(page, ctx, action, opts) {
  const { session, phase, via = 'control', think, query } = opts
  const pre = ctx.last ?? (await sample(page))
  await sleep(think)
  if (rnd() < 0.12) { // idle scroll while thinking
    const dy = uni(-1, 1) > 0 ? uni(120, 320) : -uni(120, 320)
    await page.mouse.wheel(0, dy); await sleep(uni(200, 450)); await page.mouse.wheel(0, -dy); await sleep(uni(150, 300))
    event('scroll', { dy: Math.round(dy) })
  }
  const sel = selectorFor(action, via)
  const loc = page.locator(sel).first()
  let box = await loc.boundingBox()
  if (!box) throw new Error(`no box for ${sel}`)
  const aim = () => ({ x: box.x + box.width * uni(0.3, 0.7), y: box.y + box.height * uni(0.3, 0.7) })
  let p = aim()
  const dist = Math.hypot(p.x - mouse.x, p.y - mouse.y)
  await glide(page, p.x, p.y, Math.round(Math.max(10, Math.min(36, dist / 22 + uni(-3, 5)))))
  await sleep(logn(160, 0.45)) // hover dwell
  let reaim = 0
  while (!(await underPointer(page, p.x, p.y, sel)) && reaim < 3) {
    reaim++
    if (reaim === 1) event('target-moved-under-pointer', { session, action, via, aimedAt: { x: Math.round(p.x), y: Math.round(p.y) } })
    if (trace.events.filter((e) => e.kind === 'target-moved-under-pointer').length <= 2 && reaim === 1) await shot(page, `weird-target-moved-${gIdx}`, `${action} was no longer under the pointer where the user aimed`)
    await sleep(uni(250, 500)) // "wait, where did it go?"
    box = await loc.boundingBox()
    p = aim()
    await glide(page, p.x, p.y, 14)
    await sleep(logn(140, 0.3))
  }
  const before = pre.stats.examples
  const gridBefore = pre.domGrid
  const t0 = Date.now()
  await page.mouse.down()
  await sleep(Math.max(45, logn(115, 0.35)))
  await page.mouse.up()
  let typed = null
  if (action === 'search' && via === 'control') {
    typed = query
    await sleep(uni(120, 300))
    for (const ch of query) { await page.keyboard.type(ch); await sleep(Math.max(35, logn(115, 0.4))) }
    await sleep(uni(150, 400))
    await page.keyboard.press('Enter')
  }
  // wait for the training step to land
  let after
  const deadline = Date.now() + 6000
  for (;;) {
    after = await sample(page)
    if (after.stats.examples > before || Date.now() > deadline) break
    await sleep(25)
  }
  await page.evaluate(() => window.__smartweb.idle())
  // the latency sample lands one frame after commit
  for (let k = 0; k < 20 && after.latencies.length <= pre.latencies.length && pre.latencies.length < 100; k++) { await sleep(20); after = await sample(page) }
  await sleep(30); after = await sample(page)
  const delta = after.stats.examples - before
  if (delta === 0) event('action-not-recorded', { session, action, via })
  if (delta > 1) event('action-recorded-more-than-once', { session, action, via, delta, typed })
  const gridMoved = JSON.stringify(gridBefore) !== JSON.stringify(after.domGrid)
  const movedCount = gridMoved ? gridBefore.filter((a, i) => after.domGrid[i] !== a).length : 0
  const rec = {
    globalIdx: gIdx, session, phase, idxInSession: ctx.n, mode: pre.mode, action, via, typed,
    pressedAt: t0,
    // predictions made BEFORE this action (what the user saw while deciding)
    predBlend: pre.ranking[0], predMarkov: ACTIONS[argmax(pre.markov)], predMlp: ACTIONS[argmax(pre.css)],
    shownSuggestions: pre.domSuggestions,
    hitBlend: pre.ranking[0] === action, hitMarkov: ACTIONS[argmax(pre.markov)] === action, hitMlp: ACTIONS[argmax(pre.css)] === action,
    recordedDelta: delta, reaim,
    gridBefore, gridAfter: after.domGrid, gridMoved, gridSlotsChanged: movedCount,
    latencyMs: after.latencies.length > pre.latencies.length || pre.latencies.length >= 100 ? after.latencies.at(-1) : null,
    cssJsMaxDiff: after.css.length ? maxAbsDiff(after.css, after.js) : null,
    post: after,
  }
  trace.interactions.push(rec)
  ctx.n++; gIdx++
  ctx.last = after
  const pad = (s, n) => String(s).padEnd(n)
  console.log(`#${pad(rec.globalIdx, 3)} ${session} ${pad(rec.mode, 9)} ${pad(action, 11)} via=${pad(via, 10)} pred=${pad(rec.predBlend, 11)} ${rec.hitBlend ? 'HIT ' : '    '} mk=${after.stats.markovAcc.toFixed(2)} mlp=${after.stats.mlpAcc.toFixed(2)} ex=${after.stats.examples}(+${delta}) lat=${rec.latencyMs?.toFixed(1)} grid=${gridMoved ? 'MOVED' : '-'} diff=${rec.cssJsMaxDiff?.toExponential(1)}`)
  if (gIdx % 5 === 0) save()
  return rec
}

async function setModeLikeAHuman(page, ctx, mode) {
  const s = page.locator('[data-testid=mode-select]')
  const b = await s.boundingBox()
  await glide(page, b.x + b.width / 2, b.y + b.height / 2, 18)
  await sleep(uni(150, 300))
  await s.selectOption(mode)
  await page.waitForFunction((m) => window.__smartweb.stats().mode === m, mode)
  await sleep(120)
  ctx.last = await sample(page)
  event('mode-switch', { mode, netSource: ctx.last.netSource, cssJsMaxDiff: maxAbsDiff(ctx.last.css, ctx.last.js) })
}

const ROUTINE_A = ['nav-home', 'search', 'open-card', 'favorite', 'nav-library']
const ROUTINE_B = ['nav-explore', 'search', 'open-card', 'share']

async function openSession(profile, name, { video } = {}) {
  const context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport: VIEWPORT, args: GPU,
    permissions: ['clipboard-read', 'clipboard-write'],
    ...(video ? { recordVideo: { dir: join(OUT, 'video-tmp'), size: { width: 960, height: 600 } } } : {}),
  })
  const page = context.pages()[0] ?? (await context.newPage())
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') event('console', { session: name, type: m.type(), text: m.text().slice(0, 300) }) })
  page.on('pageerror', (e) => event('pageerror', { session: name, text: String(e).slice(0, 300) }))
  return { context, page }
}

async function messages(page) {
  // the debug drawer shows the controller's log (storage.persist, restored from IndexedDB, ...)
  await page.getByTestId('debug-toggle').click()
  const txt = await page.getByTestId('debug-drawer').innerText()
  await page.getByTestId('debug-toggle').click()
  return txt
}

async function copyLink(page) {
  const b = page.getByTestId('export-link')
  const box = await b.boundingBox()
  await glide(page, box.x + box.width / 2, box.y + box.height / 2, 20)
  await sleep(200)
  await page.mouse.down(); await sleep(90); await page.mouse.up()
  await sleep(400)
  let link = null
  try { link = await page.evaluate(() => navigator.clipboard.readText()) } catch (e) { event('clipboard-read-failed', { text: String(e) }) }
  if (!link || !link.includes('#m=')) {
    const txt = await messages(page)
    link = (txt.match(/link: (\S+)/) || [])[1] ?? null
  }
  return link
}

function sessionSummary(name, extra = {}) {
  const xs = trace.interactions.filter((r) => r.session === name)
  const s = { name, interactions: xs.length, ...extra }
  trace.sessions.push(s)
  save()
  return s
}

async function run() {
  const profile = mkdtempSync(join(tmpdir(), 'smartweb-returning-'))
  trace.meta.profile = profile
  console.log('profile', profile)

  // ============ SESSION 1: learn a routine (calc) ============
  let { context, page } = await openSession(profile, 's1', { video: true })
  await page.goto(BASE)
  await ready(page)
  await page.evaluate(() => window.__smartweb.reset()) // genuinely new user (empty profile anyway)
  await page.evaluate(() => window.__smartweb.idle())
  let ctx = { n: 0, last: await sample(page) }
  trace.sessions.push({ name: 's1-load', ...ctx.last })
  await shot(page, 's1-cold-start', 'Session 1, first load: prior ranking, default grid')
  let firstAdaptShot = false
  for (let cyc = 0; cyc < 8; cyc++) {
    for (const a of ROUTINE_A) {
      // gets faster as the routine becomes familiar
      const think = logn(1300 - cyc * 90, 0.35)
      const r = await interact(page, ctx, a, { session: 's1', phase: 'learn', think, query: QUERIES.s1[cyc % 4] })
      if (!firstAdaptShot && (r.gridMoved || (r.globalIdx > 0 && trace.interactions.at(-1).post.ranking[0] === ROUTINE_A[(ROUTINE_A.indexOf(a) + 1) % ROUTINE_A.length] && cyc >= 1))) {
        firstAdaptShot = true
        await shot(page, 's1-first-adaptation', `first visible adaptation after interaction #${r.globalIdx} (${r.gridMoved ? 'grid moved' : 'top suggestion = next routine step'})`)
      }
    }
  }
  const s1End = await sample(page)
  await shot(page, 's1-end', 'End of session 1 (40 interactions, calc)')
  const linkS1 = await copyLink(page)
  event('export-link', { session: 's1', length: linkS1?.length })
  trace.portability.linkS1 = linkS1
  // quick close like a person: last click, export, then Cmd-W ~350 ms later
  const lastPressS1 = trace.interactions.at(-1).pressedAt
  const sinceLastAction = Date.now() - lastPressS1
  await sleep(350)
  const closeAt = Date.now()
  await context.close()
  sessionSummary('s1', { examplesAtClose: s1End.stats.examples, msFromLastActionToClose: closeAt - lastPressS1, msFromLastActionToExport: sinceLastAction, gridAtClose: s1End.domGrid, rankingAtClose: s1End.ranking })
  // move the video
  try {
    const vdir = join(OUT, 'video-tmp')
    const f = readdirSync(vdir).find((x) => x.endsWith('.webm'))
    if (f) { renameSync(join(vdir, f), join(OUT, 'session1.webm')); rmSync(vdir, { recursive: true }) }
  } catch (e) { event('video-move-failed', { text: String(e) }) }

  // ============ SESSION 2: resume (calc -> hybrid -> animation) ============
  await sleep(1500)
  ;({ context, page } = await openSession(profile, 's2'))
  await page.goto(BASE)
  await ready(page)
  ctx = { n: 0, last: await sample(page) }
  const s2Load = ctx.last
  const s2LoadLog = await messages(page)
  trace.sessions.push({ name: 's2-load', ...s2Load, log: s2LoadLog })
  event('s2-resume', { examplesAtS1Close: s1End.stats.examples, examplesRestored: s2Load.stats.examples, modeRestored: s2Load.mode, gridRestored: s2Load.domGrid, gridAtS1Close: s1End.domGrid, top: s2Load.ranking[0], restoredLog: /restored from IndexedDB/.test(s2LoadLog) })
  await shot(page, 's2-resume', 'Session 2 first paint: what the returning user sees before doing anything')
  const s2Modes = ['calc', 'hybrid', 'animation']
  let k = 0
  for (const mode of s2Modes) {
    if (mode !== ctx.last.mode) await setModeLikeAHuman(page, ctx, mode)
    for (let j = 0; j < 10; j++, k++) {
      const a = ROUTINE_A[k % ROUTINE_A.length]
      const top = ctx.last.ranking[0]
      // trusts the panel sometimes once it is right
      const via = top === a && rnd() < 0.35 ? 'suggestion' : 'control'
      await interact(page, ctx, a, { session: 's2', phase: `resume-${mode}`, via, think: logn(750, 0.3), query: QUERIES.s1[k % 4] })
    }
  }
  const s2End = await sample(page)
  await shot(page, 's2-end', 'End of session 2 (30 more interactions across all three modes)')
  await sleep(2500) // this time the user lingers before closing
  await context.close()
  sessionSummary('s2', { examplesAtClose: s2End.stats.examples, gridAtClose: s2End.domGrid })

  // ============ SESSION 3: habit change (animation -> hybrid -> calc) ============
  await sleep(1500)
  ;({ context, page } = await openSession(profile, 's3'))
  await page.goto(BASE)
  await ready(page)
  ctx = { n: 0, last: await sample(page) }
  trace.sessions.push({ name: 's3-load', ...ctx.last })
  event('s3-resume', { examplesAtS2Close: s2End.stats.examples, examplesRestored: ctx.last.stats.examples })
  await shot(page, 's3-resume', 'Session 3 first paint')
  const s3Modes = ['animation', 'hybrid', 'calc']
  k = 0
  let shotSwitch = false
  for (const mode of s3Modes) {
    await setModeLikeAHuman(page, ctx, mode)
    for (let j = 0; j < 15; j++, k++) {
      const a = ROUTINE_B[k % ROUTINE_B.length]
      const r = await interact(page, ctx, a, { session: 's3', phase: `change-${mode}`, think: logn(900, 0.3), query: QUERIES.s3[k % 4] })
      if (k === 2) await shot(page, 's3-old-habit-shown', 'Session 3, after the first Open of the new habit: what does it suggest next?')
      if (!shotSwitch && a === 'open-card' && r.post.ranking[0] === 'share') { shotSwitch = true; await shot(page, 's3-new-habit-learned', `first time Share is the top suggestion after Open (interaction #${r.globalIdx})`) }
    }
  }
  const s3End = await sample(page)
  await shot(page, 's3-end', 'End of session 3')
  const linkS3 = await copyLink(page)
  trace.portability.linkS3 = linkS3
  const sourceAtExport = await sample(page)
  event('export-link', { session: 's3', length: linkS3?.length })
  await sleep(2000)
  await context.close()
  sessionSummary('s3', { examplesAtClose: s3End.stats.examples })

  // ============ PORTABILITY: S3 link in a brand-new profile ============
  const fresh = mkdtempSync(join(tmpdir(), 'smartweb-returning-fresh-'))
  ;({ context, page } = await openSession(fresh, 'fresh'))
  await page.goto(linkS3)
  await ready(page)
  ctx = { n: 0, last: await sample(page) }
  const fLoad = ctx.last
  const fLog = await messages(page)
  trace.portability.freshLoad = {
    urlAfterLoad: page.url(), logImported: /imported from URL fragment/.test(fLog), log: fLog.slice(0, 2000),
    examples: [sourceAtExport.stats.examples, fLoad.stats.examples],
    acc: [[sourceAtExport.stats.markovAcc, sourceAtExport.stats.mlpAcc], [fLoad.stats.markovAcc, fLoad.stats.mlpAcc]],
    rankingSource: sourceAtExport.ranking, rankingFresh: fLoad.ranking,
    blendedMaxDiff: maxAbsDiff(sourceAtExport.blended, fLoad.blended),
    markovMaxDiff: maxAbsDiff(sourceAtExport.markov, fLoad.markov),
    note: 'source sampled right after export with the last action features; fresh profile predicts from idle features at load, so MLP inputs differ',
    gridSource: sourceAtExport.domGrid, gridFresh: fLoad.domGrid, mode: fLoad.mode,
  }
  await shot(page, 'fresh-from-link', 'Brand-new profile opened from the session-3 share link')
  for (let j = 0; j < 8; j++) {
    await interact(page, ctx, ROUTINE_B[j % 4], { session: 'fresh', phase: 'link', think: logn(850, 0.3), query: QUERIES.s3[j % 4] })
  }
  await shot(page, 'fresh-after-8', 'Fresh profile after 8 interactions of the new habit')
  await context.close()

  // ============ OLD LINK opened in the main profile ============
  ;({ context, page } = await openSession(profile, 'oldlink'))
  await page.goto(BASE); await ready(page)
  const beforeOld = await sample(page)
  await page.goto(linkS1); await ready(page)
  const afterOld = await sample(page)
  const oldLog = await messages(page)
  trace.portability.oldLinkInMainProfile = {
    examplesBefore: beforeOld.stats.examples, examplesAfter: afterOld.stats.examples,
    accBefore: [beforeOld.stats.markovAcc, beforeOld.stats.mlpAcc], accAfter: [afterOld.stats.markovAcc, afterOld.stats.mlpAcc],
    markovFromLastBefore: beforeOld.markov, markovFromLastAfter: afterOld.markov,
    rankingBefore: beforeOld.ranking, rankingAfter: afterOld.ranking, confirmPrompted: false, log: oldLog.slice(0, 1500),
  }
  await shot(page, 'oldlink-overwrote', 'Main profile after opening the session-1 link: local model state')
  await page.reload(); await ready(page)
  trace.portability.oldLinkInMainProfile.examplesAfterReload = (await sample(page)).stats.examples
  await context.close()

  trace.meta.finishedAt = new Date().toISOString()
  trace.meta.screenshots = shots
  save()
  rmSync(fresh, { recursive: true, force: true })
  rmSync(profile, { recursive: true, force: true })
  console.log('done', trace.interactions.length, 'interactions')
}

run().catch((e) => { console.error(e); trace.meta.error = String(e.stack || e); save(); process.exit(1) })
