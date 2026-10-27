// Computes the report metrics from trace.json. node reports/sessions/methodical/analyze.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const OUT = dirname(fileURLToPath(import.meta.url))
const T = JSON.parse(readFileSync(join(OUT, 'trace.json'), 'utf8'))
const tr = T.trace
const pct = (xs, p) => { const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)] : NaN }
const coldTop = tr[0].pred.suggestTop
const firstSuggest = tr.find((r) => r.correct.suggest && r.pred.suggestTop !== coldTop)
const firstGrid = tr.find((r) => r.gridChanged)
const firstAny = Math.min(firstSuggest?.i ?? Infinity, firstGrid?.i ?? Infinity)
// sustained: first index from which 10 consecutive routine predictions were right
let sustained = null
for (let i = 0; i + 10 <= tr.length; i++) if (tr.slice(i, i + 10).every((r) => r.correct.suggest)) { sustained = i; break }
const acc = (rs, k) => rs.length ? rs.filter((r) => r.correct[k]).length / rs.length : NaN
const windows = []
for (let s = 0; s < tr.length; s += 20) { const w = tr.slice(s, s + 20); windows.push({ from: s, to: s + w.length - 1, suggest: acc(w, 'suggest'), markov: acc(w, 'markov'), mlp: acc(w, 'mlp'), routineSuggest: acc(w.filter((r) => r.kind === 'routine'), 'suggest'), gridMoves: w.filter((r) => r.gridChanged).length, alphaEnd: w[w.length - 1].post.alpha }) }
const last20 = tr.slice(-20)
const lat = tr.filter((r) => r.latencyNew).map((r) => r.latency)
const latD = tr.filter((r) => r.latencyNew).map((r) => r.latDouble)
const moves = tr.filter((r) => r.gridChanged)
const devs = tr.filter((r) => r.kind === 'deviation')
const afterDev = tr.filter((r, k) => k > 0 && tr[k - 1].kind === 'deviation')
const m = {
  interactions: tr.length,
  firstSuggestCorrectNonPrior: firstSuggest?.i ?? null, firstSuggestAction: firstSuggest?.action,
  firstGridReorder: firstGrid?.i ?? null,
  firstAdaptationAtInteraction: Number.isFinite(firstAny) ? firstAny : null,
  sustained10From: sustained,
  markovTop1AccFinal: tr[tr.length - 1].post.stats.markovAcc, mlpTop1AccFinal: tr[tr.length - 1].post.stats.mlpAcc,
  last20: { suggest: acc(last20, 'suggest'), markov: acc(last20, 'markov'), mlp: acc(last20, 'mlp') },
  overall: { suggest: acc(tr, 'suggest'), markov: acc(tr, 'markov'), mlp: acc(tr, 'mlp') },
  routineOnly: { suggest: acc(tr.filter((r) => r.kind === 'routine'), 'suggest') },
  deviations: devs.length, deviationPredicted: acc(devs, 'suggest'), afterDeviationSuggest: acc(afterDev, 'suggest'),
  latencyN: lat.length, latencyMsP50: pct(lat, 50), latencyMsP95: pct(lat, 95), latencyMax: Math.max(...lat),
  latencyDoubleRafP50: pct(latD, 50), latencyDoubleRafP95: pct(latD, 95),
  cssJsMaxAbsDiff: Math.max(...tr.map((r) => r.cssJsMaxDiff)),
  layoutMovesTotal: moves.length, layoutMoves: moves.map((r) => ({ i: r.i, action: r.action, from: r.gridBefore.join(','), to: r.gridAfter.join(',') })),
  movedUnderPointer: tr.filter((r) => r.detail.movedUnderPointer).map((r) => r.i),
  multiExample: tr.filter((r) => r.examplesAdded > 1).map((r) => ({ i: r.i, action: r.action, n: r.examplesAdded })),
  missed: tr.filter((r) => r.detail.retried).map((r) => r.i),
  viaSuggestion: tr.filter((r) => r.viaSuggestion).length,
  netSources: [...new Set(tr.map((r) => r.post.netSource))],
  finalAlpha: tr[tr.length - 1].post.alpha, finalExamples: tr[tr.length - 1].post.stats.examples,
  finalGrid: tr[tr.length - 1].gridAfter, coldGrid: T.coldGrid,
  windows, parity: T.parity, events: T.events.filter((e) => e.type !== 'reload'), reload: T.events.find((e) => e.type === 'reload'),
  consoleErrors: T.consoleErrors.length, glRenderer: T.glRenderer,
  wrongSuggestions: tr.filter((r) => !r.correct.suggest && r.i > 10).map((r) => ({ i: r.i, action: r.action, kind: r.kind, said: r.pred.suggestTop, rank: r.pred.rankOfActual, markov: r.pred.markovTop, mlp: r.pred.mlpTop })),
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(m, null, 1))
console.log(JSON.stringify(m, null, 1))
