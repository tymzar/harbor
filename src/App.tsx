import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { MotionConfig } from 'motion/react'
import type { SmartWebController } from './app/controller'
import { CARD_IDS } from './cssnet/contract'
import { CARD_INFO } from './app/catalog'
import { AdaptiveGrid, DebugDrawer, NetworkHeader, Toolbar, TopNav, VisualBoundary } from './app/ui'
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

export default function App({ controller: c }: { controller: SmartWebController }) {
  const state = useSyncExternalStore(c.subscribe, c.getState)
  const hostRef = useRef<HTMLDivElement>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [visuals, setVisuals] = useState<CssNetVisuals>({})

  useEffect(() => {
    if (hostRef.current) void c.start(hostRef.current)
    void loadCssNetModule().then((m) => setVisuals(m.visuals))
  }, [c])

  // After React has committed the DOM for this state version, measure click-to-pixel.
  useLayoutEffect(() => { c.committed() }, [c, state.version])

  const { PatternLayer } = visuals
  const visualProps = { outputs: state.css, hidden: state.hidden, ranking: state.orders[state.category], mode: state.mode }
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-dvh bg-background text-foreground">
        {PatternLayer && (
          <div className="pointer-events-none fixed inset-0" aria-hidden>
            <VisualBoundary name="PatternLayer"><PatternLayer {...visualProps} /></VisualBoundary>
          </div>
        )}
        <div className="relative">
          <TopNav state={state} c={c} debugOpen={debugOpen} onToggleDebug={() => setDebugOpen((v) => !v)} />
          <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-10 sm:px-6">
            <Toolbar state={state} c={c} />
            <AdaptiveGrid state={state} c={c} />
            <section className="glass flex flex-col gap-6 rounded-3xl p-6" aria-label="Network">
              <NetworkHeader state={state} c={c} />
              <VisualBoundary name="NetworkView">
                <NetworkView
                  x={state.x}
                  hidden={state.hidden}
                  out={state.css}
                  weights={c.currentWeights()}
                  version={state.version}
                  outIds={CARD_IDS}
                  outLabels={OUT_LABELS}
                  visible={state.orders[state.category].map((id) => CARD_IDS.indexOf(id)).sort((a, b) => state.css[b] - state.css[a] || a - b)}
                  inputLabels={INPUT_LABELS}
                  inputs={SHAPE.inputs}
                  hiddenN={SHAPE.hidden}
                  hostRef={hostRef}
                  cssNodes={state.netSource === 'cssnet'}
                />
              </VisualBoundary>
            </section>
            {debugOpen && <DebugDrawer state={state} />}
          </main>
        </div>
      </div>
    </MotionConfig>
  )
}
