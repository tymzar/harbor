// Reads trace.json (written by session.mjs) and prints/writes the metrics used in report.md.
//   node reports/sessions/returning/analyze.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const t = JSON.parse(readFileSync(join(OUT, 'trace.json'), 'utf8'))
const A = ['nav-home', 'nav-explore', 'nav-library', 'search', 'open-card', 'favorite', 'share', 'settings']
const I = t.interactions
const pct = (xs, p) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] }
const rate = (xs, f) => (xs.length ? xs.filter(f).length / xs.length : NaN)
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v)
const groupBy = (xs, k) => xs.reduce((m, x) => ((m[k(x)] ??= []).push(x), m), {})

// Latency: a search typed then submitted with Enter is timed from the earlier pointerup on the
// input (see bug in report), so it is reported separately.
const latOk = (r) => r.latencyMs != null && !(r.action === 'search' && r.recordedDelta > 1)
const lat = I.filter(latOk).map((r) => r.latencyMs)
const latArtefacts = I.filter((r) => r.latencyMs != null && !latOk(r)).map((r) => ({ i: r.globalIdx, ms: r3(r.latencyMs) }))

const summary = (xs) => ({
  n: xs.length,
  blendTop1: r3(rate(xs, (r) => r.hitBlend)), markovTop1: r3(rate(xs, (r) => r.hitMarkov)), mlpTop1: r3(rate(xs, (r) => r.hitMlp)),
  latP50: r3(pct(xs.filter(latOk).map((r) => r.latencyMs), 50)), latP95: r3(pct(xs.filter(latOk).map((r) => r.latencyMs), 95)),
  maxCssJs: Math.max(...xs.map((r) => r.cssJsMaxDiff ?? 0)),
  gridMoves: xs.filter((r) => r.gridMoved).length,
  appRollingAtEnd: xs.at(-1) && { markovAcc: xs.at(-1).post.stats.markovAcc, mlpAcc: xs.at(-1).post.stats.mlpAcc, examples: xs.at(-1).post.stats.examples },
})

const firstHit = I.find((r) => r.hitBlend)
const firstMove = I.find((r) => r.gridMoved)
const firstSustained = I.find((r, k) => k >= 2 && I[k - 2].session === r.session && [I[k - 2], I[k - 1], r].every((x) => x.hitBlend))
// "hit" that is not the cold-start prior's top (open-card) by luck
const firstLearnedHit = I.find((r) => r.hitBlend && r.predBlend !== 'open-card')

// curves: app's rolling accuracies after each interaction (global index)
const curve = I.map((r) => ({ i: r.globalIdx, s: r.session, markov: r.post.stats.markovAcc, mlp: r.post.stats.mlpAcc, alpha: r3(r.post.alpha) }))

// habit change: what follows Open in session 3 (Markov row open-card, blended ranking after Open)
const opens = I.filter((r) => r.session === 's3' && r.action === 'open-card').map((r, n) => ({
  nthOpen: n + 1, i: r.globalIdx, mode: r.mode,
  markovFav: r3(r.post.markov[A.indexOf('favorite')]), markovShare: r3(r.post.markov[A.indexOf('share')]),
  mlpFav: r3(r.post.css[A.indexOf('favorite')]), mlpShare: r3(r.post.css[A.indexOf('share')]),
  blendTop: r.post.ranking[0], gridAfter: r.post.domGrid.join(','),
}))
const markovFlip = opens.find((o) => o.markovShare > o.markovFav)
const blendFlip = opens.find((o) => o.blendTop === 'share')

// first interactions of each session
const sessionStarts = Object.fromEntries(Object.entries(groupBy(I, (r) => r.session)).map(([s, xs]) => [s, xs.slice(0, 5).map((r) => ({ i: r.globalIdx, action: r.action, pred: r.predBlend, hit: r.hitBlend, gridMoved: r.gridMoved }))]))

const byMode = Object.fromEntries(Object.entries(groupBy(I.filter((r) => r.session !== 'fresh'), (r) => r.mode)).map(([m, xs]) => [m, summary(xs)]))
const byPhase = Object.fromEntries(Object.entries(groupBy(I, (r) => `${r.session}:${r.phase}`)).map(([m, xs]) => [m, summary(xs)]))
const bySession = Object.fromEntries(Object.entries(groupBy(I, (r) => r.session)).map(([m, xs]) => [m, summary(xs)]))

const metrics = {
  interactions: I.length,
  firstAdaptation: {
    firstTopSuggestionHit: firstHit && { i: firstHit.globalIdx, action: firstHit.action },
    firstHitNotPriorTop: firstLearnedHit && { i: firstLearnedHit.globalIdx, action: firstLearnedHit.action },
    firstGridMove: firstMove && { i: firstMove.globalIdx, action: firstMove.action, before: firstMove.gridBefore, after: firstMove.gridAfter },
    firstThreeHitsInARow: firstSustained && { i: firstSustained.globalIdx },
  },
  overall: summary(I.filter((r) => r.session !== 'fresh')),
  bySession, byMode, byPhase,
  latency: { n: lat.length, p50: r3(pct(lat, 50)), p95: r3(pct(lat, 95)), max: r3(Math.max(...lat)), excludedArtefacts: latArtefacts },
  cssJsMaxAbsDiff: Math.max(...I.map((r) => r.cssJsMaxDiff ?? 0)),
  layoutMovesTotal: I.filter((r) => r.gridMoved).length,
  layoutMovesNonAdjacentSwap: I.filter((r) => r.gridMoved && r.gridSlotsChanged > 2).length,
  reaims: I.filter((r) => r.reaim > 0).length,
  doubleRecordedSearch: I.filter((r) => r.recordedDelta > 1).map((r) => ({ i: r.globalIdx, typed: r.typed, delta: r.recordedDelta })),
  notRecorded: I.filter((r) => r.recordedDelta === 0).length,
  suggestionClicks: I.filter((r) => r.via === 'suggestion').length,
  habitChange: { opens, markovFlipAtOpen: markovFlip?.nthOpen ?? null, blendFlipAtOpen: blendFlip?.nthOpen ?? null },
  sessionStarts,
  curve,
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 1))
const { curve: _c, ...printable } = metrics
console.log(JSON.stringify(printable, null, 1))
