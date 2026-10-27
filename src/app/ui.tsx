import { Component, memo, useMemo, type ReactNode } from 'react'
import { Button, Card, Tooltip } from '@heroui/react'
import { motion } from 'motion/react'
import { CARD_IDS, CATEGORIES, type CardId, type Category, type CssNetMode } from '../cssnet/contract'
import { RAW_FEATURE_NAMES, INPUT_NAMES } from '../signals/features'
import { CARD_INFO, CATEGORY_INFO } from './catalog'
import type { AppState, SmartWebController } from './controller'

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M8 13.5S2.5 10.2 2.5 6.3A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5.5 1.3C13.5 10.2 8 13.5 8 13.5Z" />
    </svg>
  )
}
function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10V2.5M5 5.5l3-3 3 3M3.5 9v3.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9" />
    </svg>
  )
}

/**
 * Memoised: a press re-renders only the card whose own data changed (latency, see e2e).
 * Inside, everything but the visit count is a memoised element, so a press that only bumps
 * the count reconciles the card shell and that span, not the three buttons and two tooltips.
 */
const FeatureCard = memo(function FeatureCard({ id, n, fav, c }: { id: CardId; n: number; fav: boolean; c: SmartWebController }) {
  const info = CARD_INFO[id]
  const header = useMemo(() => (
    <Card.Header className="gap-1">
      <Card.Title className="text-base font-medium tracking-tight">{info.title}</Card.Title>
      <Card.Description className="text-sm text-muted">{info.desc}</Card.Description>
    </Card.Header>
  ), [info])
  const open = useMemo(() => (
    <Button data-testid={`card-${id}-open`} size="sm" className="rounded-full" onPress={() => c.engage(id, 'open')}>Open</Button>
  ), [id, c])
  const actions = useMemo(() => (
    <span className="ml-auto flex items-center gap-1">
      <Tooltip delay={400}>
        <Button data-testid={`card-${id}-favorite`} isIconOnly size="sm" variant="ghost" aria-label={fav ? 'Unfavorite' : 'Favorite'} aria-pressed={fav}
          className={`rounded-full ${fav ? 'text-accent' : 'text-muted'}`} onPress={() => c.engage(id, 'favorite')}>
          <HeartIcon filled={fav} />
        </Button>
        <Tooltip.Content>{fav ? 'Unfavorite' : 'Favorite'}</Tooltip.Content>
      </Tooltip>
      <Tooltip delay={400}>
        <Button data-testid={`card-${id}-share`} isIconOnly size="sm" variant="ghost" aria-label="Share" className="rounded-full text-muted" onPress={() => c.engage(id, 'share')}>
          <ShareIcon />
        </Button>
        <Tooltip.Content>Share</Tooltip.Content>
      </Tooltip>
    </span>
  ), [id, fav, c])
  return (
    <Card data-testid={`card-${id}`} className="h-44 justify-between rounded-2xl p-5">
      {header}
      <Card.Footer className="flex items-center gap-1">
        {open}
        {n > 0 && <span className="ml-2 text-xs tabular-nums text-muted">{n} {n === 1 ? 'visit' : 'visits'}</span>}
        {actions}
      </Card.Footer>
    </Card>
  )
})

const GridItem = memo(function GridItem({ id, n, fav, flash, live, c }: { id: CardId; n: number; fav: boolean; flash: number | null; live: boolean; c: SmartWebController }) {
  return (
    // Layout animation only in the shown grid: hidden grids (display:none) measure as empty boxes.
    // layoutDependency: only a card that moved (its flash changed) takes a layout snapshot; a
    // press that only updates its visit count does not force a measure during the commit.
    <motion.div
      layout={live}
      layoutDependency={flash}
      data-card={id}
      transition={{ type: 'spring', stiffness: 260, damping: 32 }}
      className="relative rounded-2xl"
    >
      <FeatureCard id={id} n={n} fav={fav} c={c} />
      {flash !== null && (
        <motion.span
          key={flash}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-accent/50"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
        />
      )}
    </motion.div>
  )
})

/**
 * One category's cards, in the model's order. Re-sorts live and on entry.
 *
 * All three categories' grids stay mounted; only the current one is shown (the others are
 * `hidden`, without the test id). Measured: remounting six cards (buttons, tooltips, motion)
 * on every category switch cost ~20 ms of the click (React dev build); showing a mounted grid
 * costs a re-render of its six memoised items.
 */
function CategoryGrid({ category, shown, state, c }: { category: Category; shown: boolean; state: AppState; c: SmartWebController }) {
  const order = state.orders[category]
  const current = shown && state.category === category
  return (
    <div
      data-testid={current ? 'adaptive-grid' : undefined}
      data-category={current ? category : undefined}
      hidden={!current}
      // Entry fade (was motion initial/animate on each card): a CSS animation on the grid, which
      // replays whenever the grid is shown again. On the grid, not the cards: a card that React
      // moves in the DOM would restart its own animation.
      className="grid-enter grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {order.map((id) => (
        <GridItem key={id} id={id} n={state.engaged[id] ?? 0} fav={!!state.favorites[id]} flash={current && state.moved.includes(id) ? state.orderVersion : null} live={current} c={c} />
      ))}
    </div>
  )
}

/** The current category's cards (all categories stay mounted; see CategoryGrid). */
export function AdaptiveGrid({ state, c, shown }: { state: AppState; c: SmartWebController; shown: boolean }) {
  return <>{CATEGORIES.map((cat) => <CategoryGrid key={cat} category={cat} shown={shown} state={state} c={c} />)}</>
}

const MODE_LABEL: Record<CssNetMode, string> = { calc: 'calc()', hybrid: 'Hybrid', animation: 'Animation' }

/** Header for the model card: what it shows and the engine picker. */
export const NetworkHeader = memo(function NetworkHeader({ state, c }: { state: AppState; c: SmartWebController }) {
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium tracking-tight">Model</h2>
        <p className="max-w-2xl text-sm text-muted">
          {state.netSource === 'cssnet'
            ? `One network ranks all 18 cards. Every output below is computed by the stylesheet, each category in its own context; ${CATEGORY_INFO[state.category].title} is in scope (${MODE_LABEL[state.mode]} engine).`
            : 'One network ranks all 18 cards (JavaScript fallback: the CSS engine is unavailable here).'}
        </p>
      </div>
      <label className="ml-auto flex items-center gap-2 text-sm text-muted">
        <span>Engine</span>
        <select
          data-testid="mode-select"
          className="cursor-[var(--cursor-interactive)] rounded-full border-0 bg-surface-secondary px-3 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
          value={state.mode}
          onChange={(e) => c.setMode(e.target.value as CssNetMode)}
        >
          <option value="calc">calc()</option>
          <option value="hybrid">Hybrid</option>
          <option value="animation">Animation</option>
        </select>
      </label>
    </div>
  )
}, (a, b) => a.state.category === b.state.category && a.state.mode === b.state.mode && a.state.netSource === b.state.netSource)

const fmt = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? '–' : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3))

export function DebugDrawer({ state }: { state: AppState }) {
  const lat = state.latencies
  const order = state.orders[state.category]
  return (
    <Card data-testid="debug-drawer" className="rounded-2xl p-5 text-xs">
      <Card.Header className="gap-1">
        <Card.Title className="text-base font-medium tracking-tight">Debug</Card.Title>
        <Card.Description className="text-muted">
          net: {state.netSource} ({state.mode}) · reference: {state.jsForwardSource} · model thread: {state.workerKind} ·
          CSS valid: {String(state.cssValid)} · max |CSS − JS| = {state.cssJsMaxDiff.toExponential(2)}
        </Card.Description>
      </Card.Header>
      <Card.Content className="grid gap-6 lg:grid-cols-3">
        <section>
          <h3 className="mb-2 font-medium">Order: {CATEGORY_INFO[state.category].title}</h3>
          <table className="w-full tabular-nums">
            <thead><tr className="text-left text-muted"><th className="font-normal">Card</th><th className="font-normal">Affinity</th><th className="font-normal">MLP css</th><th className="font-normal">MLP js</th><th className="font-normal">Score</th></tr></thead>
            <tbody>
              {order.map((id) => {
                const i = CARD_IDS.indexOf(id)
                return <tr key={id}><td>{id}</td><td>{fmt(state.affinity[i])}</td><td>{fmt(state.css[i])}</td><td>{fmt(state.js[i])}</td><td>{fmt(state.scores[i])}</td></tr>
              })}
            </tbody>
          </table>
          <h3 className="mb-2 mt-4 font-medium">Stats</h3>
          <p>examples {state.stats.examples} · top-3 hit: shown {pct(state.stats.blendAcc)} · affinity {pct(state.stats.affinityAcc)} · MLP {pct(state.stats.mlpAcc)} (last {state.stats.accN}) · MLP weight {pct(state.alpha)}</p>
          <p>evidence {CATEGORIES.map((k) => `${k} ${state.evidence[k].toFixed(1)}`).join(' · ')}</p>
          <p>latency n={lat.length} p50 {percentile(lat, 50).toFixed(1)} ms · p95 {percentile(lat, 95).toFixed(1)} ms</p>
          <p className="break-all">hidden: {state.hidden.map((h) => h.toFixed(2)).join(' ')}</p>
          {state.shareLink && <p className="break-all">link: {state.shareLink}</p>}
          <ul className="mt-2 text-muted">{state.messages.map((m, k) => <li key={k}>{m}</li>)}</ul>
        </section>
        <section>
          <h3 className="mb-2 font-medium">Model Input</h3>
          <table className="w-full tabular-nums">
            <tbody>{INPUT_NAMES.map((n, i) => <tr key={n}><td className="text-muted">{n}</td><td>{fmt(state.x[i])}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="max-h-96 overflow-auto">
          <h3 className="mb-2 font-medium">Raw Features ({RAW_FEATURE_NAMES.length})</h3>
          <table className="w-full tabular-nums">
            <tbody>{RAW_FEATURE_NAMES.map((n, i) => <tr key={n}><td className="text-muted">{n}</td><td>{fmt(state.raw[i])}</td></tr>)}</tbody>
          </table>
        </section>
      </Card.Content>
    </Card>
  )
}

/** Keeps a broken visual from taking the app down. */
export class VisualBoundary extends Component<{ name: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: Error) { return { error: e.message } }
  render() {
    if (this.state.error) return <p className="text-xs text-danger">{this.props.name} failed: {this.state.error}</p>
    return this.props.children
  }
}
