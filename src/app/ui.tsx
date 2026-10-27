import { Component, memo, type ReactNode, useRef } from 'react'
import { Button, Card, Tooltip } from '@heroui/react'
import { motion } from 'motion/react'
import { CARD_IDS, CATEGORIES, type CardId, type CssNetMode } from '../cssnet/contract'
import { RAW_FEATURE_NAMES, INPUT_NAMES } from '../signals/features'
import { CARD_INFO, CATEGORY_INFO } from './catalog'
import type { AppState, SmartWebController } from './controller'

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`

function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="text-foreground">
      <circle cx="4" cy="6" r="1.6" fill="currentColor" opacity=".45" />
      <circle cx="4" cy="14" r="1.6" fill="currentColor" opacity=".45" />
      <circle cx="10" cy="10" r="2" fill="currentColor" opacity=".7" />
      <circle cx="16" cy="10" r="2.4" fill="var(--accent)" />
      <path d="M4 6 10 10M4 14l6-4m0 0h6" stroke="currentColor" strokeWidth=".8" opacity=".35" fill="none" />
    </svg>
  )
}

function DebugIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
      <circle cx="5.5" cy="4.5" r="1.4" fill="var(--background)" />
      <circle cx="10.5" cy="8" r="1.4" fill="var(--background)" />
      <circle cx="7" cy="11.5" r="1.4" fill="var(--background)" />
    </svg>
  )
}

export function TopNav({ state, c, debugOpen, onToggleDebug }: { state: AppState; c: SmartWebController; debugOpen: boolean; onToggleDebug: () => void }) {
  return (
    <header className="relative z-20 px-4 pt-5 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center gap-4">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="text-sm font-semibold tracking-tight">smart-web</span>
        </div>
        <nav className="glass mx-auto flex items-center gap-0.5 rounded-full p-1" aria-label="Categories">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              data-testid={`nav-${cat}`}
              size="sm"
              variant="ghost"
              aria-current={state.category === cat ? 'page' : undefined}
              className={`rounded-full px-4 ${state.category === cat ? 'bg-surface text-foreground shadow-sm' : 'text-muted'}`}
              onPress={() => c.enter(cat)}
            >
              {CATEGORY_INFO[cat].title}
            </Button>
          ))}
        </nav>
        <Tooltip delay={300}>
          <Button
            data-testid="debug-toggle"
            isIconOnly
            variant="ghost"
            aria-label={debugOpen ? 'Hide debug' : 'Show debug'}
            aria-expanded={debugOpen}
            className={`rounded-full ${debugOpen ? 'bg-surface shadow-sm' : ''}`}
            onPress={onToggleDebug}
          >
            <DebugIcon />
          </Button>
          <Tooltip.Content>{debugOpen ? 'Hide debug' : 'Debug'}</Tooltip.Content>
        </Tooltip>
      </div>
    </header>
  )
}

/** Page title plus the model controls, which stay visible but quiet. */
export function Toolbar({ state, c }: { state: AppState; c: SmartWebController }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const content = CATEGORY_INFO[state.category]
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{content.title}</h1>
        <p className="text-sm text-muted">{content.lede} Ordered by how you use it.</p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <Button data-testid="replay-journey" size="sm" variant="secondary" className="rounded-full" isDisabled={!state.ready || state.replaying} onPress={() => c.replay()}>
          {state.replaying ? 'Replaying…' : 'Replay'}
        </Button>
        <Button data-testid="export-model" size="sm" variant="ghost" className="rounded-full text-muted" isDisabled={!state.ready} onPress={() => c.exportJson()}>Export</Button>
        <Button data-testid="export-link" size="sm" variant="ghost" className="rounded-full text-muted" isDisabled={!state.ready} onPress={() => c.exportLink()}>Copy Link</Button>
        <Button data-testid="import-model" size="sm" variant="ghost" className="rounded-full text-muted" isDisabled={!state.ready} onPress={() => fileRef.current?.click()}>Import</Button>
        <Button data-testid="reset-model" size="sm" variant="danger-soft" className="rounded-full" isDisabled={!state.ready} onPress={() => c.reset()}>Reset</Button>
        <input
          ref={fileRef} data-testid="import-file" type="file" accept="application/json,.json" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) await c.importJsonText(await f.text())
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

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

/** Memoised: a press re-renders only the card whose own data changed (latency, see e2e). */
const FeatureCard = memo(function FeatureCard({ id, n, fav, c }: { id: CardId; n: number; fav: boolean; c: SmartWebController }) {
  const info = CARD_INFO[id]
  return (
    <Card data-testid={`card-${id}`} className="glass h-44 justify-between rounded-3xl p-5">
      <Card.Header className="gap-1">
        <Card.Title className="text-base font-medium tracking-tight">{info.title}</Card.Title>
        <Card.Description className="text-sm text-muted">{info.desc}</Card.Description>
      </Card.Header>
      <Card.Footer className="flex items-center gap-1">
        <Button data-testid={`card-${id}-open`} size="sm" className="rounded-full" onPress={() => c.engage(id, 'open')}>Open</Button>
        {n > 0 && <span className="ml-2 text-xs tabular-nums text-muted">{n} {n === 1 ? 'visit' : 'visits'}</span>}
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
      </Card.Footer>
    </Card>
  )
})

const GridItem = memo(function GridItem({ id, n, fav, flash, c }: { id: CardId; n: number; fav: boolean; flash: number | null; c: SmartWebController }) {
  return (
    <motion.div
      layout
      data-card={id}
      transition={{ type: 'spring', stiffness: 260, damping: 32 }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl"
    >
      <FeatureCard id={id} n={n} fav={fav} c={c} />
      {flash !== null && (
        <motion.span
          key={flash}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-accent/50"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
        />
      )}
    </motion.div>
  )
})

/** The current category's cards, in the model's order. Re-sorts live and on entry. */
export function AdaptiveGrid({ state, c }: { state: AppState; c: SmartWebController }) {
  const order = state.orders[state.category]
  return (
    <div data-testid="adaptive-grid" data-category={state.category} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {order.map((id) => (
        <GridItem key={id} id={id} n={state.engaged[id] ?? 0} fav={!!state.favorites[id]} flash={state.moved.includes(id) ? state.orderVersion : null} c={c} />
      ))}
    </div>
  )
}

const MODE_LABEL: Record<CssNetMode, string> = { calc: 'calc()', hybrid: 'Hybrid', animation: 'Animation' }

/** Header for the network panel: title, engine picker and the few numbers that matter. */
export function NetworkHeader({ state, c }: { state: AppState; c: SmartWebController }) {
  const stats: [string, string][] = [
    ['Examples', String(state.stats.examples)],
    ['Top 3 hit', pct(state.stats.blendAcc)],
    ['MLP share', pct(state.alpha)],
    ['Latency', `${percentile(state.latencies, 50).toFixed(0)} ms`],
  ]
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium tracking-tight">Network</h2>
        <p className="text-sm text-muted">
          {state.netSource === 'cssnet' ? `Ranks ${CATEGORY_INFO[state.category].title} in the stylesheet, ${MODE_LABEL[state.mode]} engine.` : 'Ranking in JavaScript (CSS engine unavailable).'}
        </p>
      </div>
      <dl className="ml-auto flex flex-wrap gap-2" data-testid="stats">
        {stats.map(([k, v]) => (
          <div key={k} className="flex min-w-20 flex-col gap-0.5 rounded-2xl bg-surface-secondary/60 px-3 py-2">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="text-sm font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <label className="flex items-center gap-2 self-center text-sm text-muted">
        <span>Engine</span>
        <select
          data-testid="mode-select"
          className="cursor-[var(--cursor-interactive)] rounded-full border-0 bg-surface-secondary/70 px-3 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
}

const fmt = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? '–' : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3))

export function DebugDrawer({ state }: { state: AppState }) {
  const lat = state.latencies
  const order = state.orders[state.category]
  return (
    <Card data-testid="debug-drawer" className="glass rounded-3xl p-5 text-xs">
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
