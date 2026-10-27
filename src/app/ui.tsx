import { Component, type ReactNode, useRef } from 'react'
import { Button, Card, Chip, Label, SearchField, Switch } from '@heroui/react'
import { motion } from 'motion/react'
import { ACTIONS, type ActionId, type CssNetMode } from '../cssnet/contract'
import { RAW_FEATURE_NAMES, MODEL_FEATURES } from '../signals/features'
import { ACTION_LABELS, type AppState, type SmartWebController, type View } from './controller'

const VIEW_CONTENT: Record<View, { title: string; items: string[] }> = {
  'nav-home': { title: 'Home', items: ['Morning briefing', 'Saved drafts', 'Team updates'] },
  'nav-explore': { title: 'Explore', items: ['Basalt coastlines', 'Night-sky timelapse', 'Moss gardens'] },
  'nav-library': { title: 'Library', items: ['Field notes vol. 2', 'Typography specimens', 'Recipe index'] },
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`

export function TopNav({ state, c, debugOpen, onToggleDebug }: { state: AppState; c: SmartWebController; debugOpen: boolean; onToggleDebug: () => void }) {
  const views: View[] = ['nav-home', 'nav-explore', 'nav-library']
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-separator bg-surface/80 px-4 py-3 backdrop-blur sm:px-6">
      <span className="mr-2 text-lg font-semibold tracking-tight">smart-web</span>
      <nav className="flex gap-1" aria-label="Primary">
        {views.map((v) => (
          <Button key={v} data-testid={`action-${v}`} size="sm" variant={state.view === v ? 'primary' : 'ghost'} onPress={() => c.act(v)}>
            {ACTION_LABELS[v]}
          </Button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          Engine
          <select
            data-testid="mode-select"
            className="rounded-lg border border-separator bg-surface px-2 py-1 text-sm text-foreground"
            value={state.mode}
            onChange={(e) => c.setMode(e.target.value as CssNetMode)}
          >
            <option value="calc">calc()</option>
            <option value="animation">animation</option>
            <option value="hybrid">hybrid</option>
          </select>
        </label>
        <Button data-testid="debug-toggle" size="sm" variant="outline" onPress={onToggleDebug} aria-expanded={debugOpen}>
          {debugOpen ? 'Hide debug' : 'Debug'}
        </Button>
      </div>
    </header>
  )
}

export function Toolbar({ state, c }: { state: AppState; c: SmartWebController }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const lat = state.latencies
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button data-testid="replay-journey" size="sm" variant="secondary" isDisabled={!state.ready || state.replaying} onPress={() => c.replay()}>
        {state.replaying ? 'Replaying…' : 'Replay journey'}
      </Button>
      <Button data-testid="reset-model" size="sm" variant="danger-soft" isDisabled={!state.ready} onPress={() => c.reset()}>Reset</Button>
      <Button data-testid="export-model" size="sm" variant="tertiary" isDisabled={!state.ready} onPress={() => c.exportJson()}>Export JSON</Button>
      <Button data-testid="export-link" size="sm" variant="tertiary" isDisabled={!state.ready} onPress={() => c.exportLink()}>Copy link</Button>
      <Button data-testid="import-model" size="sm" variant="tertiary" isDisabled={!state.ready} onPress={() => fileRef.current?.click()}>Import</Button>
      <input
        ref={fileRef} data-testid="import-file" type="file" accept="application/json,.json" className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) await c.importJsonText(await f.text())
          e.target.value = ''
        }}
      />
      <div className="ml-auto flex flex-wrap gap-2 text-xs" data-testid="stats">
        <Chip size="sm" variant="soft">examples {state.stats.examples}</Chip>
        <Chip size="sm" variant="soft">Markov {pct(state.stats.markovAcc)}</Chip>
        <Chip size="sm" variant="soft">MLP {pct(state.stats.mlpAcc)}</Chip>
        <Chip size="sm" variant="soft">MLP weight {pct(state.alpha)}</Chip>
        <Chip size="sm" variant="soft">p50 {percentile(lat, 50).toFixed(1)} ms</Chip>
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
  const body = (() => {
    switch (action) {
      case 'open-card':
        return (
          <>
            <Card.Header>
              <Card.Title>{content.items[0]}</Card.Title>
              <Card.Description>{content.title} · opened {state.opened}×</Card.Description>
            </Card.Header>
            <Card.Footer><Button data-testid="action-open-card" onPress={() => c.act('open-card')}>Open</Button></Card.Footer>
          </>
        )
      case 'favorite':
        return (
          <>
            <Card.Header>
              <Card.Title>{content.items[1]}</Card.Title>
              <Card.Description>{state.favorites} favourites this session</Card.Description>
            </Card.Header>
            <Card.Footer><Button data-testid="action-favorite" variant="secondary" onPress={() => c.act('favorite')}>Favorite</Button></Card.Footer>
          </>
        )
      case 'share':
        return (
          <>
            <Card.Header>
              <Card.Title>{content.items[2]}</Card.Title>
              <Card.Description>{state.shares ? `Shared ${state.shares}×` : 'Send it to someone'}</Card.Description>
            </Card.Header>
            <Card.Footer><Button data-testid="action-share" variant="outline" onPress={() => c.act('share')}>Share</Button></Card.Footer>
          </>
        )
      case 'search':
        return (
          <>
            <Card.Header>
              <Card.Title>Search</Card.Title>
              <Card.Description>Find anything in {content.title.toLowerCase()}</Card.Description>
            </Card.Header>
            <Card.Content>
              <div onClick={(e) => { if ((e.target as Element).closest('input')) doSearch() }}>
                <SearchField aria-label="Search" value={state.query} onChange={(q) => c.setQuery(q)} onSubmit={doSearch} fullWidth>
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input data-testid="action-search" placeholder="Search…" />
                    <SearchField.ClearButton />
                  </SearchField.Group>
                </SearchField>
              </div>
            </Card.Content>
          </>
        )
      case 'settings':
        return (
          <>
            <Card.Header>
              <Card.Title>Settings</Card.Title>
              <Card.Description>Denser cards and smaller text</Card.Description>
            </Card.Header>
            <Card.Content>
              <Switch isSelected={state.compact} onChange={() => c.act('settings')}>
                <Switch.Content data-testid="action-settings">
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                  <Label>Compact mode</Label>
                </Switch.Content>
              </Switch>
            </Card.Content>
          </>
        )
      default:
        return null
    }
  })()
  return <Card className={state.compact ? 'h-full gap-2 p-3 text-sm' : 'h-full min-h-40'}>{body}</Card>
}

export function AdaptiveGrid({ state, c }: { state: AppState; c: SmartWebController }) {
  return (
    <div data-testid="adaptive-grid" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {state.gridOrder.map((a) => (
        <motion.div
          key={a}
          layout
          data-grid-action={a}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          animate={{ opacity: 1 }}
          initial={{ opacity: 0 }}
          className={state.lastMoved === a ? 'rounded-3xl ring-2 ring-accent/60' : ''}
        >
          <GridCard action={a} state={state} c={c} />
        </motion.div>
      ))}
    </div>
  )
}

export function SuggestionPanel({ state, c }: { state: AppState; c: SmartWebController }) {
  const top = state.ranking.slice(0, 4)
  return (
    <Card>
      <Card.Header>
        <Card.Title>Suggested next</Card.Title>
        <Card.Description>Markov {pct(1 - state.alpha)} · MLP {pct(state.alpha)} ({state.netSource === 'cssnet' ? `CSS ${state.mode}` : 'JS fallback'})</Card.Description>
      </Card.Header>
      <Card.Content>
        <ul data-testid="suggestion-list" className="flex flex-col gap-2">
          {top.map((a) => {
            const p = state.blended[ACTIONS.indexOf(a)]
            return (
              <li key={a}>
                <Button data-testid="suggestion-item" data-action={a} fullWidth variant="tertiary" onPress={() => c.act(a)} className="justify-between">
                  <span>{ACTION_LABELS[a]}</span>
                  <span className="tabular-nums text-muted">{pct(p)}</span>
                </Button>
              </li>
            )
          })}
        </ul>
      </Card.Content>
    </Card>
  )
}

const fmt = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? '–' : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3))

export function DebugDrawer({ state }: { state: AppState }) {
  const lat = state.latencies
  return (
    <Card data-testid="debug-drawer" className="text-xs">
      <Card.Header>
        <Card.Title>Debug</Card.Title>
        <Card.Description>
          net: {state.netSource} ({state.mode}) · reference: {state.jsForwardSource} · model thread: {state.workerKind} ·
          CSS valid: {String(state.cssValid)} · max |CSS − JS| = {state.cssJsMaxDiff.toExponential(2)}
        </Card.Description>
      </Card.Header>
      <Card.Content className="grid gap-4 lg:grid-cols-3">
        <section>
          <h4 className="mb-1 font-semibold">Ranking</h4>
          <table className="w-full tabular-nums">
            <thead><tr className="text-left text-muted"><th>action</th><th>Markov</th><th>MLP css</th><th>MLP js</th><th>blend</th></tr></thead>
            <tbody>
              {state.ranking.map((a) => {
                const i = ACTIONS.indexOf(a)
                return <tr key={a}><td>{a}</td><td>{fmt(state.markov[i])}</td><td>{fmt(state.css[i])}</td><td>{fmt(state.js[i])}</td><td>{fmt(state.blended[i])}</td></tr>
              })}
            </tbody>
          </table>
          <h4 className="mb-1 mt-3 font-semibold">Stats</h4>
          <p>examples {state.stats.examples} · Markov acc {pct(state.stats.markovAcc)} · MLP acc {pct(state.stats.mlpAcc)} (last {state.stats.accN})</p>
          <p>latency n={lat.length} p50 {percentile(lat, 50).toFixed(1)} ms · p95 {percentile(lat, 95).toFixed(1)} ms</p>
          <p>hidden: {state.hidden.map((h) => h.toFixed(2)).join(' ')}</p>
          {state.shareLink && <p className="break-all">link: {state.shareLink}</p>}
          <ul className="mt-2 text-muted">{state.messages.map((m, k) => <li key={k}>{m}</li>)}</ul>
        </section>
        <section>
          <h4 className="mb-1 font-semibold">Model input (normalised)</h4>
          <table className="w-full tabular-nums">
            <tbody>{MODEL_FEATURES.map((f, i) => <tr key={f.name}><td>{f.name}</td><td>{fmt(state.x[i])}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="max-h-96 overflow-auto">
          <h4 className="mb-1 font-semibold">Raw features ({RAW_FEATURE_NAMES.length})</h4>
          <table className="w-full tabular-nums">
            <tbody>{RAW_FEATURE_NAMES.map((n, i) => <tr key={n}><td>{n}</td><td>{fmt(state.raw[i])}</td></tr>)}</tbody>
          </table>
        </section>
      </Card.Content>
    </Card>
  )
}

/** Keeps a broken visual from agent B's module from taking the app down. */
export class VisualBoundary extends Component<{ name: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: Error) { return { error: e.message } }
  render() {
    if (this.state.error) return <p className="text-xs text-danger">{this.props.name} failed: {this.state.error}</p>
    return this.props.children
  }
}
