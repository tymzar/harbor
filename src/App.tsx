import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { MotionConfig } from 'motion/react'
import { Card } from '@heroui/react'
import type { SmartWebController } from './app/controller'
import { AdaptiveGrid, DebugDrawer, SuggestionPanel, Toolbar, TopNav, VisualBoundary } from './app/ui'
import { loadCssNetModule, type CssNetVisuals } from './app/cssnetBridge'

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

  const { PatternLayer, DotGrid } = visuals
  const visualProps = { outputs: state.css, hidden: state.hidden, ranking: state.ranking, mode: state.mode }
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-dvh bg-background text-foreground">
        {PatternLayer && (
          <div className="pointer-events-none fixed inset-0 -z-0 opacity-60" aria-hidden>
            <VisualBoundary name="PatternLayer"><PatternLayer {...visualProps} /></VisualBoundary>
          </div>
        )}
        <div className="relative">
          <TopNav state={state} c={c} debugOpen={debugOpen} onToggleDebug={() => setDebugOpen((v) => !v)} />
          <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
            <Toolbar state={state} c={c} />
            <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
              <AdaptiveGrid state={state} c={c} />
              <aside className="flex flex-col gap-4">
                <SuggestionPanel state={state} c={c} />
                {DotGrid && (
                  <Card>
                    <Card.Header><Card.Title>Network</Card.Title></Card.Header>
                    <Card.Content><VisualBoundary name="DotGrid"><DotGrid {...visualProps} /></VisualBoundary></Card.Content>
                  </Card>
                )}
              </aside>
            </div>
            {debugOpen && <DebugDrawer state={state} />}
          </main>
        </div>
        {/* The CSS network lives here. Rendered (not display:none) so styles and animations compute. */}
        <div
          ref={hostRef}
          data-testid="cssnet-host"
          aria-hidden
          style={{ position: 'fixed', left: 0, top: 0, width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}
        />
      </div>
    </MotionConfig>
  )
}
