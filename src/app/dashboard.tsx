import { memo } from 'react'
import { Card, Chip, Table } from '@heroui/react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CARD_IDS, CATEGORIES, cardsOf, type Category } from '../cssnet/contract'
import { CARD_INFO, CATEGORY_INFO } from './catalog'
import type { AppState } from './controller'
import { percentile } from './ui'

const pct = (v: number) => `${Math.round(v * 100)}%`
const VERB_LABEL: Record<string, string> = { open: 'Open', favorite: 'Favorite', unfavorite: 'Unfavorite', share: 'Share', search: 'Search pick', query: 'Searched, no pick' }

function Kpi({ title, value, caption }: { title: string; value: string; caption: string }) {
  return (
    <Card className="gap-1 rounded-2xl p-4">
      <span className="text-sm text-muted">{title}</span>
      <span className="text-2xl font-semibold tabular-nums leading-none">{value}</span>
      <span className="text-xs text-muted">{caption}</span>
    </Card>
  )
}

export const KpiStrip = memo(function KpiStrip({ state }: { state: AppState }) {
  const n = state.stats.examples
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi title="Presses learned" value={String(n)} caption={`${state.activity.filter((a) => !a.counted).length} repeats ignored recently`} />
      <Kpi title="Top 3 hit" value={state.stats.accN ? pct(state.stats.blendAcc) : '–'} caption={`last ${state.stats.accN} presses`} />
      <Kpi title="MLP share" value={pct(state.alpha)} caption="of the shown score" />
      <Kpi title="Latency" value={`${percentile(state.latencies, 50).toFixed(0)} ms`} caption="median click to screen" />
    </div>
  )
}, (a, b) => a.state.stats === b.state.stats && a.state.alpha === b.state.alpha && a.state.activity === b.state.activity && a.state.latencies === b.state.latencies)

const tooltipStyle = {
  contentStyle: { background: 'var(--overlay, var(--surface))', border: '1px solid var(--separator)', borderRadius: 12, fontSize: 12, color: 'var(--foreground)' },
  labelStyle: { color: 'var(--foreground)', fontWeight: 500 },
  itemStyle: { color: 'var(--foreground)' },
}
const axisTick = { fill: 'var(--muted)', fontSize: 11 }
/** Legend text in ink, not series color: only the swatch carries identity. */
const legendText = (v: string) => <span style={{ color: 'var(--muted)' }}>{v}</span>

/** Why this order: each card's shown score split into its two sources. */
export const ScoreBreakdownCard = memo(function ScoreBreakdownCard({ state, category }: { state: AppState; category?: Category }) {
  const cat = category ?? state.category
  const order = state.orders[cat]
  const data = order.map((id) => {
    const i = CARD_IDS.indexOf(id)
    return { name: CARD_INFO[id].title, affinity: (1 - state.alpha) * state.affinity[i], mlp: state.alpha * state.cssAll[i] }
  })
  return (
    <Card className="rounded-2xl p-5">
      <Card.Header className="gap-1">
        <Card.Title className="text-base">Why This Order</Card.Title>
        <Card.Description className="text-sm text-muted">Shown score per card in {CATEGORY_INFO[cat].title}</Card.Description>
      </Card.Header>
      <Card.Content>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" tickFormatter={pct} tick={axisTick} axisLine={false} tickLine={false} domain={[0, 'auto']} />
            <YAxis type="category" dataKey="name" width={124} tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip {...tooltipStyle} cursor={{ fill: 'var(--chart-grid)' }} formatter={(v) => pct(Number(v))} />
            <Legend iconType="circle" iconSize={8} formatter={legendText} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="affinity" name="Affinity" stackId="s" fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} isAnimationActive={false} />
            <Bar dataKey="mlp" name="MLP (CSS)" stackId="s" fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </Card.Content>
    </Card>
  )
}, (a, b) => {
  // Only this category's entries are drawn: the idle refresh of the other categories' nets
  // (a new cssAll that differs elsewhere) must not re-render the chart.
  const cat = a.category ?? a.state.category
  if (a.category !== b.category || a.state.category !== b.state.category || a.state.alpha !== b.state.alpha || a.state.orders[cat].join() !== b.state.orders[cat].join()) return false
  return cardsOf(cat).every((id) => { const i = CARD_IDS.indexOf(id); return a.state.affinity[i] === b.state.affinity[i] && a.state.cssAll[i] === b.state.cssAll[i] })
})

/** Rolling top-3 hit rate after each counted press, per predictor and for the shown order. */
export const RankingQualityCard = memo(function RankingQualityCard({ state }: { state: AppState }) {
  const data = state.history
  return (
    <Card className="rounded-2xl p-5">
      <Card.Header className="gap-1">
        <Card.Title className="text-base">Ranking Quality</Card.Title>
        <Card.Description className="text-sm text-muted">Was the next card already in the top 3? Rolling, last 20 presses</Card.Description>
      </Card.Header>
      <Card.Content>
        {data.length < 2 ? (
          <div className="grid h-[230px] place-items-center text-sm text-muted">Press a few cards to see the curve.</div>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={data} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="n" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={pct} tick={axisTick} axisLine={false} tickLine={false} width={40} />
              <Tooltip {...tooltipStyle} labelFormatter={(n) => `After ${n} presses`} formatter={(v) => pct(Number(v))} />
              <Legend iconType="plainline" formatter={legendText} wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="shown" name="Shown order" stroke="var(--series-3)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="affinity" name="Affinity" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="mlp" name="MLP" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card.Content>
    </Card>
  )
}, (a, b) => a.state.history === b.state.history)

/** Engagement evidence per category: how much each order rests on. */
export const UsageCard = memo(function UsageCard({ state }: { state: AppState }) {
  const max = Math.max(1, ...CATEGORIES.map((c) => state.evidence[c]))
  return (
    <Card className="rounded-2xl p-5">
      <Card.Header className="gap-1">
        <Card.Title className="text-base">Usage by Category</Card.Title>
        <Card.Description className="text-sm text-muted">Recent, weighted presses behind each order</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4 pt-2">
        {CATEGORIES.map((c) => (
          <div key={c} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className={c === state.category ? 'font-medium' : 'text-muted'}>{CATEGORY_INFO[c].title}</span>
              <span className="tabular-nums text-muted">{state.evidence[c].toFixed(1)}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-secondary">
              <div className="h-2 rounded-full" style={{ width: `${(state.evidence[c] / max) * 100}%`, background: 'var(--series-1)' }} />
            </div>
          </div>
        ))}
        <p className="text-xs text-muted">A category starts reordering at about two deliberate presses.</p>
      </Card.Content>
    </Card>
  )
}, (a, b) => a.state.evidence === b.state.evidence && a.state.category === b.state.category)

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export const ActivityTable = memo(function ActivityTable({ state }: { state: AppState }) {
  return (
    <Card className="rounded-2xl p-5">
      <Card.Header className="gap-1">
        <Card.Title className="text-base">Recent Activity</Card.Title>
        <Card.Description className="text-sm text-muted">What each press taught the model</Card.Description>
      </Card.Header>
      <Card.Content>
        {state.activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No presses yet.</p>
        ) : (
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Recent activity" className="min-w-[560px]">
                <Table.Header>
                  <Table.Column isRowHeader>Card</Table.Column>
                  <Table.Column>Category</Table.Column>
                  <Table.Column>Action</Table.Column>
                  <Table.Column>Weight</Table.Column>
                  <Table.Column>Was in Top 3</Table.Column>
                  <Table.Column>Time</Table.Column>
                </Table.Header>
                <Table.Body>
                  {state.activity.slice(0, 20).map((a) => (
                    <Table.Row key={`${a.at}-${a.card}-${a.verb}`} id={`${a.at}-${a.card}-${a.verb}`}>
                      <Table.Cell>{CARD_INFO[a.card].title}</Table.Cell>
                      <Table.Cell>{CATEGORY_INFO[a.category].title}</Table.Cell>
                      <Table.Cell>{VERB_LABEL[a.verb]}</Table.Cell>
                      <Table.Cell className="tabular-nums">{a.counted ? a.weight.toFixed(2) : 'repeat'}</Table.Cell>
                      <Table.Cell>
                        {a.counted
                          ? <Chip size="sm" variant="soft" color={a.hit ? 'success' : 'default'}>{a.hit ? 'Yes' : 'No'}</Chip>
                          : <span className="text-muted">–</span>}
                      </Table.Cell>
                      <Table.Cell className="tabular-nums text-muted">{timeFmt.format(a.at)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        )}
      </Card.Content>
    </Card>
  )
}, (a, b) => a.state.activity === b.state.activity)
