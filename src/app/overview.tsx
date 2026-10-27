import { Fragment, memo } from 'react'
import { Button, Card } from '@heroui/react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CARD_IDS, CATEGORIES, type Category } from '../cssnet/contract'
import { INPUT_NAMES } from '../signals/features'
import { CARD_INFO, CATEGORY_INFO } from './catalog'
import type { AppState, SmartWebController } from './controller'
import { percentile } from './ui'

/** Every category's learned order side by side: the ranking capability at a glance. */
export const OrdersOverview = memo(function OrdersOverview({ state, onOpen }: { state: AppState; onOpen: (c: Category) => void }) {
  return (
    <Card className="rounded-2xl p-5">
      <Card.Header className="gap-1">
        <Card.Title className="text-base">Learned Orders</Card.Title>
        <Card.Description className="text-sm text-muted">Each category ranked on its own, from the same model</Card.Description>
      </Card.Header>
      <Card.Content className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const order = state.orders[cat]
          const max = Math.max(1e-6, ...order.map((id) => state.scores[CARD_IDS.indexOf(id)] ?? 0))
          const learned = state.evidence[cat] >= 1.8
          return (
            <section key={cat} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <Button size="sm" variant="ghost" className="-ml-2 px-2 font-medium" onPress={() => onOpen(cat)}>{CATEGORY_INFO[cat].title}</Button>
                <span className="text-xs text-muted">{learned ? 'learned' : 'default order'}</span>
              </div>
              <ol className="flex flex-col gap-2">
                {order.map((id, rank) => {
                  const sc = state.scores[CARD_IDS.indexOf(id)] ?? 0
                  return (
                    <li key={id} className="flex flex-col gap-1">
                      <div className="flex items-baseline gap-2 text-sm">
                        <span className="w-4 tabular-nums text-muted">{rank + 1}</span>
                        <span className="truncate">{CARD_INFO[id].title}</span>
                        <span className="ml-auto tabular-nums text-xs text-muted">{state.engaged[id] ?? 0}</span>
                      </div>
                      <div className="ml-6 h-1.5 rounded-full bg-surface-secondary">
                        <div className="h-1.5 rounded-full" style={{ width: `${(sc / max) * 100}%`, background: 'var(--series-1)', opacity: learned ? 1 : 0.35 }} />
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}
      </Card.Content>
    </Card>
  )
}, (a, b) => a.state.orders === b.state.orders && a.state.scores === b.state.scores && a.state.evidence === b.state.evidence && a.state.engaged === b.state.engaged)

const SIGNAL_LABEL: Record<string, string> = {
  pressDuration: 'Press length', approachVelocity: 'Approach speed', deceleration: 'Braking', pathStraightness: 'Path straightness',
  tremor: 'Tremor', hoverDwell: 'Hover dwell', burstCount2s: 'Click bursts',
}

/** The running pointer intensity the network sees, as deviation from your usual (0 = typical). */
export const LiveSignalsCard = memo(function LiveSignalsCard({ state }: { state: AppState }) {
  const names = INPUT_NAMES.slice(0, 7)
  const z = names.map((_, i) => state.x[i] ?? 0)
  const calm = (z[0] + z[5]) - (z[1] + z[6])
  const mood = calm > 1 ? 'Calmer than usual' : calm < -1 ? 'More rushed than usual' : 'Your usual pace'
  return (
    <Card className="rounded-2xl p-5">
      <Card.Header className="gap-1">
        <Card.Title className="text-base">Live Signals</Card.Title>
        <Card.Description className="text-sm text-muted">How you have been clicking, against your own usual</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3 pt-2">
        <span className="text-xl font-semibold tracking-tight">{mood}</span>
        <div className="flex flex-col gap-2">
          {names.map((n, i) => {
            const v = Math.max(-3, Math.min(3, z[i]))
            const w = (Math.abs(v) / 3) * 50
            return (
              <div key={n} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span className="truncate text-muted">{SIGNAL_LABEL[n] ?? n}</span>
                <div className="relative h-2 rounded-full bg-surface-secondary" title={`${v.toFixed(2)} vs usual`}>
                  <div className="absolute top-0 h-2 w-px bg-separator" style={{ left: '50%' }} />
                  <div className="absolute top-0 h-2 rounded-full" style={{ left: v < 0 ? `${50 - w}%` : '50%', width: `${w}%`, background: v < 0 ? 'var(--series-1)' : 'var(--series-2)' }} />
                </div>
                <span className="text-right tabular-nums text-xs text-muted">{v > 0 ? '+' : ''}{v.toFixed(1)}</span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted">Below usual on the left, above on the right. These are the network's first 7 inputs.</p>
      </Card.Content>
    </Card>
  )
}, (a, b) => a.state.x === b.state.x)

const MODE_NAME: Record<string, string> = { calc: 'calc()', hybrid: 'Hybrid', animation: 'Animation' }

/** The CSS engine: live status plus an on-demand benchmark of all three modes on this browser. */
export const EngineCard = memo(function EngineCard({ state, c }: { state: AppState; c: SmartWebController }) {
  const data = (state.benchmark ?? []).map((b) => ({ name: MODE_NAME[b.mode], us: Math.round(b.usPerEval), diff: b.maxDiff }))
  const rows: [string, string][] = [
    ['Engine', `${MODE_NAME[state.mode]} · ${state.netSource === 'cssnet' ? 'CSS' : 'JS fallback'}`],
    ['Networks', '3 (one per category), 18 outputs'],
    ['CSS vs JS', state.cssJsMaxDiff ? state.cssJsMaxDiff.toExponential(1) : '–'],
    ['Click to screen', `${percentile(state.latencies, 50).toFixed(0)} ms median · ${percentile(state.latencies, 95).toFixed(0)} ms p95`],
  ]
  return (
    <Card className="rounded-2xl p-5">
      <Card.Header className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Card.Title className="text-base">CSS Engine</Card.Title>
          <Card.Description className="text-sm text-muted">The stylesheet runs the forward pass</Card.Description>
        </div>
        <Button data-testid="benchmark" size="sm" variant="secondary" isDisabled={state.benchmarking || !state.ready} onPress={() => void c.benchmark()}>
          {state.benchmarking ? 'Measuring…' : 'Benchmark'}
        </Button>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4 pt-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-muted">{k}</dt><dd className="tabular-nums">{v}</dd></Fragment>))}
        </dl>
        {data.length ? (
          <div>
            <p className="mb-1 text-xs text-muted">Time per forward pass on this browser (µs, lower is faster)</p>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={data} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={76} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--chart-grid)' }} formatter={(v, _n, item) => [`${v} µs · max |CSS − JS| ${(item.payload as { diff: number }).diff.toExponential(1)}`, 'Per pass']}
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 12, fontSize: 12, color: 'var(--foreground)' }} />
                <Bar dataKey="us" fill="var(--series-1)" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  <LabelList dataKey="us" position="right" style={{ fill: 'var(--muted)', fontSize: 11 }} formatter={(v) => `${v} µs`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted">Benchmark times calc(), Hybrid and Animation here, with your current weights.</p>
        )}
      </Card.Content>
    </Card>
  )
}, (a, b) => a.state.benchmark === b.state.benchmark && a.state.benchmarking === b.state.benchmarking && a.state.mode === b.state.mode && a.state.netSource === b.state.netSource && a.state.cssJsMaxDiff === b.state.cssJsMaxDiff && a.state.latencies === b.state.latencies && a.state.ready === b.state.ready)
