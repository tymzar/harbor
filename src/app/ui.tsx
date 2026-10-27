import { Component, type ReactNode, useRef } from 'react'
import { Button, Card, Label, SearchField, Switch, Tooltip } from '@heroui/react'
import { motion } from 'motion/react'
import { ACTIONS, type ActionId, type CssNetMode } from '../cssnet/contract'
import { RAW_FEATURE_NAMES, MODEL_FEATURES } from '../signals/features'
import { ACTION_LABELS, type AppState, type SmartWebController, type View } from './controller'

const VIEW_CONTENT: Record<View, { title: string; lede: string; items: string[] }> = {
  'nav-home': { title: 'Home', lede: 'Your day at a glance.', items: ['Morning Briefing', 'Saved Drafts', 'Team Updates'] },
  'nav-explore': { title: 'Explore', lede: 'Places and things worth a look.', items: ['Basalt Coastlines', 'Night-Sky Timelapse', 'Moss Gardens'] },
  'nav-library': { title: 'Library', lede: 'Everything you have kept.', items: ['Field Notes, Vol. 2', 'Typography Specimens', 'Recipe Index'] },
}

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
  const views: View[] = ['nav-home', 'nav-explore', 'nav-library']
  return (
    <header className="relative z-20 px-4 pt-5 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center gap-4">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="text-sm font-semibold tracking-tight">smart-web</span>
        </div>
        <nav className="glass mx-auto flex items-center gap-0.5 rounded-full p-1" aria-label="Primary">
          {views.map((v) => (
            <Button
              key={v}
              data-testid={`action-${v}`}
              size="sm"
              variant="ghost"
              aria-current={state.view === v ? 'page' : undefined}
              className={`rounded-full px-4 ${state.view === v ? 'bg-surface text-foreground shadow-sm' : 'text-muted'}`}
              onPress={() => c.act(v)}
            >
              {ACTION_LABELS[v]}
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
  const content = VIEW_CONTENT[state.view]
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{content.title}</h1>
        <p className="text-sm text-muted">{content.lede} The layout learns from how you use it.</p>
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

function GridCard({ action, state, c }: { action: ActionId; state: AppState; c: SmartWebController }) {
  const content = VIEW_CONTENT[state.view]
  const recentSearch = useRef(0)
  const doSearch = () => {
    const now = performance.now()
    if (now - recentSearch.current < 1500) return
    recentSearch.current = now
    void c.act('search')
  }
  const desc = state.compact ? 'text-xs' : 'text-sm'
  const header = (title: string, d: string) => (
    <Card.Header className="gap-1">
      <Card.Title className="text-base font-medium tracking-tight">{title}</Card.Title>
      <Card.Description className={`${desc} text-muted`}>{d}</Card.Description>
    </Card.Header>
  )
  const body = (() => {
    switch (action) {
      case 'open-card':
        return (
          <>
            {header(content.items[0], `Opened ${state.opened} ${state.opened === 1 ? 'time' : 'times'}`)}
            <Card.Footer><Button data-testid="action-open-card" size="sm" className="rounded-full" onPress={() => c.act('open-card')}>Open</Button></Card.Footer>
          </>
        )
      case 'favorite':
        return (
          <>
            {header(content.items[1], state.favorites ? `${state.favorites} saved this session` : 'Keep it for later')}
            <Card.Footer><Button data-testid="action-favorite" size="sm" variant="outline" className="rounded-full" onPress={() => c.act('favorite')}>Favorite</Button></Card.Footer>
          </>
        )
      case 'share':
        return (
          <>
            {header(content.items[2], state.shares ? `Shared ${state.shares} ${state.shares === 1 ? 'time' : 'times'}` : 'Send it to someone')}
            <Card.Footer><Button data-testid="action-share" size="sm" variant="outline" className="rounded-full" onPress={() => c.act('share')}>Share</Button></Card.Footer>
          </>
        )
      case 'search':
        return (
          <>
            {header('Search', `Find anything in ${content.title.toLowerCase()}`)}
            <Card.Footer>
              <div className="w-full" onClick={(e) => { if ((e.target as Element).closest('input')) doSearch() }}>
                <SearchField aria-label="Search" value={state.query} onChange={(q) => c.setQuery(q)} onSubmit={doSearch} fullWidth variant="secondary">
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input data-testid="action-search" placeholder="Search" />
                    <SearchField.ClearButton />
                  </SearchField.Group>
                </SearchField>
              </div>
            </Card.Footer>
          </>
        )
      case 'settings':
        return (
          <>
            {header('Display', 'Denser text across cards')}
            <Card.Footer>
              <Switch isSelected={state.compact} onChange={() => c.act('settings')} className="w-full">
                <Switch.Content data-testid="action-settings" className="flex w-full items-center justify-between">
                  <Label className="text-sm">Compact</Label>
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                </Switch.Content>
              </Switch>
            </Card.Footer>
          </>
        )
      default:
        return null
    }
  })()
  // Fixed height: toggling compact never moves the card or its controls.
  return <Card className="glass h-44 justify-between rounded-3xl p-5">{body}</Card>
}

export function AdaptiveGrid({ state, c }: { state: AppState; c: SmartWebController }) {
  return (
    <div data-testid="adaptive-grid" className="grid grid-flow-dense grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {state.gridOrder.map((a) => (
        <motion.div
          key={a}
          layout
          data-grid-action={a}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          animate={{ opacity: 1 }}
          initial={{ opacity: 0 }}
          className={`relative rounded-3xl ${a === 'search' ? 'sm:col-span-2' : ''}`}
        >
          <GridCard action={a} state={state} c={c} />
          {state.lastMoved === a && (
            <motion.span
              key={state.version}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-accent/50"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 1.6, ease: 'easeOut' }}
            />
          )}
        </motion.div>
      ))}
    </div>
  )
}

export function SuggestionPanel({ state, c }: { state: AppState; c: SmartWebController }) {
  const top = state.ranking.slice(0, 4)
  return (
    <Card className="glass rounded-3xl p-5">
      <Card.Header className="gap-1">
        <Card.Title className="text-base font-medium tracking-tight">Suggested</Card.Title>
        <Card.Description className="text-sm text-muted">Learned from your clicks</Card.Description>
      </Card.Header>
      <Card.Content>
        <ul data-testid="suggestion-list" className="-mx-2 flex flex-col gap-0.5">
          {top.map((a, k) => {
            const p = state.blended[ACTIONS.indexOf(a)]
            return (
              <li key={a}>
                <Button
                  data-testid="suggestion-item"
                  data-action={a}
                  fullWidth
                  variant="ghost"
                  onPress={() => c.act(a)}
                  className={`justify-between rounded-xl px-2 ${k === 0 ? 'text-foreground' : 'text-muted'}`}
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={`size-1.5 rounded-full ${k === 0 ? 'bg-accent' : 'bg-transparent'}`} />
                    {ACTION_LABELS[a]}
                  </span>
                  <span className="tabular-nums text-xs text-muted">{pct(p)}</span>
                </Button>
              </li>
            )
          })}
        </ul>
      </Card.Content>
    </Card>
  )
}

const MODE_LABEL: Record<CssNetMode, string> = { calc: 'calc()', hybrid: 'Hybrid', animation: 'Animation' }

/** Header for the network panel: title, engine picker and the few numbers that matter. */
export function NetworkHeader({ state, c }: { state: AppState; c: SmartWebController }) {
  const stats: [string, string][] = [
    ['Examples', String(state.stats.examples)],
    ['Markov', pct(state.stats.markovAcc)],
    ['MLP', pct(state.stats.mlpAcc)],
    ['Latency', `${percentile(state.latencies, 50).toFixed(0)} ms`],
  ]
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium tracking-tight">Network</h2>
        <p className="text-sm text-muted">
          {state.netSource === 'cssnet' ? `Forward pass computed by the stylesheet, ${MODE_LABEL[state.mode]} engine.` : 'Forward pass in JavaScript (CSS engine unavailable).'}
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
          <h3 className="mb-2 font-medium">Ranking</h3>
          <table className="w-full tabular-nums">
            <thead><tr className="text-left text-muted"><th className="font-normal">Action</th><th className="font-normal">Markov</th><th className="font-normal">MLP css</th><th className="font-normal">MLP js</th><th className="font-normal">Blend</th></tr></thead>
            <tbody>
              {state.ranking.map((a) => {
                const i = ACTIONS.indexOf(a)
                return <tr key={a}><td>{a}</td><td>{fmt(state.markov[i])}</td><td>{fmt(state.css[i])}</td><td>{fmt(state.js[i])}</td><td>{fmt(state.blended[i])}</td></tr>
              })}
            </tbody>
          </table>
          <h3 className="mb-2 mt-4 font-medium">Stats</h3>
          <p>examples {state.stats.examples} · Markov acc {pct(state.stats.markovAcc)} · MLP acc {pct(state.stats.mlpAcc)} (last {state.stats.accN})</p>
          <p>latency n={lat.length} p50 {percentile(lat, 50).toFixed(1)} ms · p95 {percentile(lat, 95).toFixed(1)} ms</p>
          <p className="break-all">hidden: {state.hidden.map((h) => h.toFixed(2)).join(' ')}</p>
          {state.shareLink && <p className="break-all">link: {state.shareLink}</p>}
          <ul className="mt-2 text-muted">{state.messages.map((m, k) => <li key={k}>{m}</li>)}</ul>
        </section>
        <section>
          <h3 className="mb-2 font-medium">Model Input</h3>
          <table className="w-full tabular-nums">
            <tbody>{MODEL_FEATURES.map((f, i) => <tr key={f.name}><td className="text-muted">{f.name}</td><td>{fmt(state.x[i])}</td></tr>)}</tbody>
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
