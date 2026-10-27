// Computes the explorer-session metrics from trace.json. node reports/sessions/explorer/analyze.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const OUT = process.env.OUT ?? dirname(fileURLToPath(import.meta.url))
const t = JSON.parse(readFileSync(join(OUT, 'trace.json'), 'utf8'))
const A = ['nav-home', 'nav-explore', 'nav-library', 'search', 'open-card', 'favorite', 'share', 'settings']
const S = t.steps
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] }
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
const r = (v, d = 3) => Number(v.toFixed(d))
const entropy = (p) => -p.reduce((s, v) => s + (v > 0 ? v * Math.log2(v) : 0), 0)
const movesBetween = (a, b) => { // minimum moved elements = n - LCS
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) L[i][j] = a[i - 1] === b[j - 1] ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1])
  return n - L[n][m]
}

function phaseStats(steps) {
  const n = steps.length
  return {
    n,
    topHitRate: r(mean(steps.map((s) => +s.topHit))),
    markovHitRate: r(mean(steps.map((s) => +s.markovHit))),
    mlpHitRate: r(mean(steps.map((s) => +s.mlpHit))),
    meanTopProb: r(mean(steps.map((s) => s.topProb))),
    maxTopProb: r(Math.max(...steps.map((s) => s.topProb))),
    shareTopProbOver040: r(mean(steps.map((s) => +(s.topProb > 0.4)))),
    meanEntropyBits: r(mean(steps.map((s) => entropy(s.pre.blended)))),
    gridMoves: steps.reduce((m, s) => m + movesBetween(s.pre.gridOrder, s.post.gridOrder), 0),
    interactionsWithMove: steps.filter((s) => s.gridMoved).length,
    topSuggestionChanges: steps.filter((s) => s.pre.ranking[0] !== s.post.ranking[0]).length,
    examplesDeltaNot1: steps.filter((s) => s.examplesDelta !== 1).map((s) => ({ i: s.i, action: s.action, delta: s.examplesDelta, presses: s.presses, enter: !!s.enter })),
  }
}

const rand = S.filter((s) => s.phase === 'random'), pat = S.filter((s) => s.phase === 'pattern')
// rolling 12-interaction accuracy (own computation from pre-action predictions)
const W = 12
const rolling = S.map((_, i) => {
  const w = S.slice(Math.max(0, i - W + 1), i + 1)
  return { i, markov: r(mean(w.map((s) => +s.markovHit)), 2), mlp: r(mean(w.map((s) => +s.mlpHit)), 2), top: r(mean(w.map((s) => +s.topHit)), 2), hookMarkov: r(S[i].post.stats.markovAcc, 2), hookMlp: r(S[i].post.stats.mlpAcc, 2), alpha: r(S[i].post.alpha, 2) }
})
const firstAdapt = S.find((s) => s.topHit || s.gridMoved)
const firstHit = S.find((s) => s.topHit), firstMove = S.find((s) => s.gridMoved)
// pattern pickup: first pattern interaction after which top suggestion is right for >= 4 of the next 4
const p0 = pat[0].i
let pickupTop = null, pickupMarkov = null
for (const s of pat) {
  const w = S.slice(s.i, s.i + 4)
  if (pickupTop === null && w.length === 4 && w.every((x) => x.topHit)) pickupTop = s.i
  if (pickupMarkov === null && w.length === 4 && w.every((x) => x.markovHit)) pickupMarkov = s.i
}
// latencies: one per step (last value after the step) + all hook values at the end
const stepLat = S.map((s) => ({ i: s.i, action: s.action, enter: !!s.enter, ms: s.post.latencies.at(-1) }))
const allLat = t.final.latencies
const nonSearchLat = stepLat.filter((x) => x.action !== 'search').map((x) => x.ms)
const lateSearch = stepLat.filter((x) => x.ms > 200)
// calibration (random phase): bucket by top prob
const buckets = [[0, 0.2], [0.2, 0.3], [0.3, 0.4], [0.4, 0.6], [0.6, 1]].map(([lo, hi]) => {
  const b = rand.filter((s) => s.topProb >= lo && s.topProb < hi)
  return { range: `${lo}-${hi}`, n: b.length, meanProb: b.length ? r(mean(b.map((s) => s.topProb))) : null, hitRate: b.length ? r(mean(b.map((s) => +s.topHit))) : null }
})
const patBuckets = [[0, 0.3], [0.3, 0.4], [0.4, 0.6], [0.6, 1]].map(([lo, hi]) => {
  const b = pat.filter((s) => s.topProb >= lo && s.topProb < hi)
  return { range: `${lo}-${hi}`, n: b.length, meanProb: b.length ? r(mean(b.map((s) => s.topProb))) : null, hitRate: b.length ? r(mean(b.map((s) => +s.topHit))) : null }
})
const out = {
  interactions: S.length,
  examplesFinal: t.final.stats.examples,
  gl: t.gl,
  firstVisibleAdaptation: firstAdapt && { i: firstAdapt.i, kind: firstAdapt.topHit ? 'top-hit' : 'grid-reorder' },
  firstTopHit: firstHit?.i, firstGridMove: firstMove?.i,
  patternStartsAt: p0, patternPickupTop4of4: pickupTop, patternPickupMarkov4of4: pickupMarkov,
  random: phaseStats(rand),
  pattern: phaseStats(pat),
  patternFirstHalf: phaseStats(pat.slice(0, pat.length / 2)),
  patternSecondHalf: phaseStats(pat.slice(pat.length / 2)),
  final: { markovAccHook: t.final.stats.markovAcc, mlpAccHook: t.final.stats.mlpAcc, alpha: t.final.alpha,
    markovLast16: r(mean(S.slice(-16).map((s) => +s.markovHit))), mlpLast16: r(mean(S.slice(-16).map((s) => +s.mlpHit))), topLast16: r(mean(S.slice(-16).map((s) => +s.topHit))) },
  latency: {
    perStep: { n: stepLat.length, p50: r(pct(stepLat.map((x) => x.ms), 50), 1), p95: r(pct(stepLat.map((x) => x.ms), 95), 1), max: r(Math.max(...stepLat.map((x) => x.ms)), 1) },
    perStepExclSearch: { n: nonSearchLat.length, p50: r(pct(nonSearchLat, 50), 1), p95: r(pct(nonSearchLat, 95), 1), max: r(Math.max(...nonSearchLat), 1) },
    hookAll: { n: allLat.length, p50: r(pct(allLat, 50), 1), p95: r(pct(allLat, 95), 1) },
    over200ms: lateSearch,
  },
  cssJsMaxAbsDiff: Math.max(...S.map((s) => s.cssJsMaxDiff)),
  domGridMismatches: S.filter((s) => s.domGridMismatch).map((s) => s.i),
  calibrationRandom: buckets, calibrationPattern: patBuckets,
  rolling,
  consoleErrors: t.consoleErrors.length,
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(out, null, 1))
const { rolling: _r, ...brief } = out
console.log(JSON.stringify(brief, null, 1))
console.log('rolling every 8:', rolling.filter((x) => x.i % 8 === 7).map((x) => `${x.i}: mk ${x.markov} mlp ${x.mlp} top ${x.top} (hook mk ${x.hookMarkov} mlp ${x.hookMlp}, a ${x.alpha})`).join('\n'))
