import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { MotionConfig } from 'motion/react'
import type { SmartWebController } from './app/controller'
import { ACTION_LABELS } from './app/controller'
import { AdaptiveGrid, DebugDrawer, NetworkHeader, SuggestionPanel, Toolbar, TopNav, VisualBoundary } from './app/ui'
import { NetworkView } from './app/NetworkView'
import { loadCssNetModule, type CssNetVisuals } from './app/cssnetBridge'
import { SHAPE } from './model/config'
import { MODEL_FEATURES } from './signals/features'

const PRETTY: Record<string, string> = {
  pressDuration: 'Press length', approachVelocity: 'Approach speed', deceleration: 'Braking', pathStraightness: 'Path straightness',
  tremor: 'Tremor', hoverDwell: 'Hover dwell', burstCount2s: 'Click burst',
}
const INPUT_LABELS = MODEL_FEATURES.map((f) => PRETTY[f.name] ?? (f.name.startsWith('last1:') ? `After ${ACTION_LABELS[f.name.slice(6) as keyof typeof ACTION_LABELS].replace(' mode', '')}` : f.name))

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
  const visualProps = { outputs: state.css, hidden: state.hidden, ranking: state.ranking, mode: state.mode }
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
            <div className="grid items-start gap-4 lg:grid-cols-[1fr_17rem]">
              <AdaptiveGrid state={state} c={c} />
              <SuggestionPanel state={state} c={c} />
            </div>
            <section className="glass flex flex-col gap-6 rounded-3xl p-6" aria-label="Network">
              <NetworkHeader state={state} c={c} />
              <VisualBoundary name="NetworkView">
                <NetworkView
                  x={state.x}
                  hidden={state.hidden}
                  out={state.css}
                  weights={c.currentWeights()}
                  version={state.version}
                  labels={ACTION_LABELS}
                  inputLabels={INPUT_LABELS}
                  inputs={SHAPE.inputs}
                  hiddenN={SHAPE.hidden}
                  outputs={SHAPE.outputs}
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
