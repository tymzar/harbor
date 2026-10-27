import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { MotionConfig } from 'motion/react'
import { Card, Tabs } from '@heroui/react'
import type { AppState, SmartWebController } from './app/controller'
import { CARD_IDS, CATEGORIES, cardsOf, type Category } from './cssnet/contract'
import { CARD_INFO, CATEGORY_INFO } from './app/catalog'
import { AdaptiveGrid, DebugDrawer, NetworkHeader, VisualBoundary } from './app/ui'
import { Navbar, Sidebar, type Page } from './app/shell'
import { ActivityTable, KpiStrip, RankingQualityCard, ScoreBreakdownCard, UsageCard } from './app/dashboard'
import { EngineCard, LiveSignalsCard, OrdersOverview } from './app/overview'
import { ModelBar } from './app/modelbar'
import { SearchPalette } from './app/search'
import { NetworkView } from './app/NetworkView'
import { loadCssNetModule, type CssNetVisuals } from './app/cssnetBridge'
import { SHAPE } from './model/config'
import { INPUT_NAMES } from './signals/features'

const PRETTY: Record<string, string> = {
  pressDuration: 'Press length', approachVelocity: 'Approach speed', deceleration: 'Braking', pathStraightness: 'Path straightness',
  tremor: 'Tremor', hoverDwell: 'Hover dwell', burstCount2s: 'Click burst', todSin: 'Hour (sin)', todCos: 'Hour (cos)',
  'category:home': 'In Home', 'category:explore': 'In Explore', 'category:library': 'In Library',
}
const INPUT_LABELS = INPUT_NAMES.map((n) => PRETTY[n] ?? n)
const OUT_LABELS = CARD_IDS.map((id) => CARD_INFO[id].title)

type ModelTab = 'network' | 'learning' | 'engine'

/** Everything below the fold renders from a deferred state, after the reorder has been committed. */
const OverviewPage = memo(function OverviewPage({ state, c, onOpen }: { state: AppState; c: SmartWebController; onOpen: (cat: Category) => void }) {
  const d = useDeferredValue(state)
  return (
    <>
      <KpiStrip state={d} />
      <OrdersOverview state={d} onOpen={onOpen} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <LiveSignalsCard state={d} />
        <RankingQualityCard state={d} />
        <UsageCard state={d} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <EngineCard state={d} c={c} />
        <ActivityTable state={d} />
      </div>
    </>
  )
})

const CategoryExtras = memo(function CategoryExtras({ state }: { state: AppState }) {
  const d = useDeferredValue(state)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ScoreBreakdownCard state={d} />
      <LiveSignalsCard state={d} />
    </div>
  )
})

const LearningTab = memo(function LearningTab({ state }: { state: AppState }) {
  const d = useDeferredValue(state)
  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {CATEGORIES.map((cat) => <ScoreBreakdownCard key={cat} state={d} category={cat} />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RankingQualityCard state={d} />
        <LiveSignalsCard state={d} />
        <UsageCard state={d} />
      </div>
    </>
  )
})

export default function App({ controller: c }: { controller: SmartWebController }) {
  const state = useSyncExternalStore(c.subscribe, c.getState)
  const hostRef = useRef<HTMLDivElement>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const toggleDebug = useCallback(() => setDebugOpen((v) => !v), [])
  const [page, setPage] = useState<Page>('category')
  const [tab, setTab] = useState<ModelTab>('network')
  const [searchOpen, setSearchOpen] = useState(false)
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const onPicked = useCallback(() => setPage('category'), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((o) => !o) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  // Measure the model's size whenever the Model page opens or the model changes while it is open.
  useEffect(() => { if (page === 'model' && state.ready) void c.measureSize() }, [c, page, state.ready, state.stats.examples])
  const openCategory = useCallback((cat: Category) => { setPage('category'); void c.enter(cat) }, [c])
  const [visuals, setVisuals] = useState<CssNetVisuals>({})

  useEffect(() => {
    if (hostRef.current) void c.start(hostRef.current)
    void loadCssNetModule().then((m) => setVisuals(m.visuals))
  }, [c])

  // After React has committed the DOM for this state version, measure click-to-pixel.
  useLayoutEffect(() => { c.committed() }, [c, state.version])

  const { PatternLayer } = visuals
  const visualProps = { outputs: state.css, hidden: state.hidden, ranking: state.orders[state.category], mode: state.mode }
  // The model card shows every output, grouped by category, each group sorted by its own CSS output.
  const visible = CATEGORIES.flatMap((cat) => cardsOf(cat).map((id) => CARD_IDS.indexOf(id)).sort((a, b) => state.cssAll[b] - state.cssAll[a] || a - b))
  const showNetwork = page === 'model' && tab === 'network'
  const groups = CATEGORIES.map((cat) => ({ title: CATEGORY_INFO[cat].title, size: 6, active: cat === state.category }))
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-dvh bg-background text-foreground">
        {PatternLayer && (
          <div className="pointer-events-none fixed inset-0 opacity-60" aria-hidden>
            <VisualBoundary name="PatternLayer"><PatternLayer {...visualProps} /></VisualBoundary>
          </div>
        )}
        <div className="relative flex">
          <Sidebar state={state} c={c} page={page} onPage={setPage} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Navbar state={state} c={c} page={page} onPage={setPage} debugOpen={debugOpen} onToggleDebug={toggleDebug} onSearch={openSearch} />
            <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 pb-12 pt-4 sm:px-6 lg:px-8">
              {page === 'category' && (
                <>
                  <AdaptiveGrid state={state} c={c} />
                  <CategoryExtras state={state} />
                </>
              )}
              {page === 'overview' && <OverviewPage state={state} c={c} onOpen={openCategory} />}
              {page === 'model' && <ModelBar state={state} c={c} />}
              {page === 'model' && (
                <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as ModelTab)}>
                  <Tabs.ListContainer>
                    <Tabs.List aria-label="Model views">
                      <Tabs.Tab id="network" data-testid="tab-network">Network<Tabs.Indicator /></Tabs.Tab>
                      <Tabs.Tab id="learning" data-testid="tab-learning">Learning<Tabs.Indicator /></Tabs.Tab>
                      <Tabs.Tab id="engine" data-testid="tab-engine">Engine<Tabs.Indicator /></Tabs.Tab>
                    </Tabs.List>
                  </Tabs.ListContainer>
                </Tabs>
              )}
              {page === 'model' && tab === 'learning' && <LearningTab state={state} />}
              {page === 'model' && tab === 'engine' && <EngineCard state={state} c={c} />}
              {/* Always mounted: the CSS nets live in this card. Offscreen (not display:none) when not shown. */}
              <div className={showNetwork ? '' : 'pointer-events-none fixed top-0 -left-[10000px] w-[1100px]'} aria-hidden={!showNetwork}>
                <Card className="gap-6 rounded-2xl p-6" aria-label="Model network">
                  <NetworkHeader state={state} c={c} />
                  <VisualBoundary name="NetworkView">
                    <NetworkView
                      x={state.x}
                      hidden={state.hidden}
                      out={state.cssAll}
                      weights={c.currentWeights()}
                      version={state.version}
                      outIds={CARD_IDS}
                      outLabels={OUT_LABELS}
                      visible={visible}
                      groups={groups}
                      inputLabels={INPUT_LABELS}
                      inputs={SHAPE.inputs}
                      hiddenN={SHAPE.hidden}
                      height={520}
                      hostRef={hostRef}
                      cssNodes={state.netSource === 'cssnet'}
                      paused={!showNetwork}
                    />
                  </VisualBoundary>
                </Card>
              </div>
              {debugOpen && <DebugDrawer state={state} />}
              <SearchPalette state={state} c={c} open={searchOpen} onOpenChange={setSearchOpen} onPicked={onPicked} />
            </main>
          </div>
        </div>
      </div>
    </MotionConfig>
  )
}
