import { memo, useState, type ComponentType, type ReactNode } from 'react'
import { Button, Drawer, Tooltip } from '@heroui/react'
import { motion } from 'motion/react'
import { Bars, BookOpen, Compass, Cpu, House, LayoutCells, Play, Sliders } from '@gravity-ui/icons'
import { cardsOf, type Category } from '../cssnet/contract'
import { CATEGORY_INFO } from './catalog'
import type { AppState, SmartWebController } from './controller'

export type Page = 'overview' | 'category' | 'model'
export const PAGE_INFO: Record<Exclude<Page, 'category'>, { title: string; lede: string }> = {
  overview: { title: 'Overview', lede: 'Everything the model has learned so far.' },
  model: { title: 'Model', lede: 'One network, three scopes, computed by the stylesheet.' },
}

const CATEGORY_ICON: Record<Category, ComponentType<{ className?: string }>> = { home: House, explore: Compass, library: BookOpen }

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden className="text-foreground">
      <circle cx="4" cy="6" r="1.6" fill="currentColor" opacity=".45" />
      <circle cx="4" cy="14" r="1.6" fill="currentColor" opacity=".45" />
      <circle cx="10" cy="10" r="2" fill="currentColor" opacity=".7" />
      <circle cx="16" cy="10" r="2.4" fill="var(--accent)" />
      <path d="M4 6 10 10M4 14l6-4m0 0h6" stroke="currentColor" strokeWidth=".8" opacity=".35" fill="none" />
    </svg>
  )
}

function NavItem({ icon: Icon, label, active, trailing, onPress, testId, tone }: {
  icon: ComponentType<{ className?: string }>; label: string; active?: boolean; trailing?: ReactNode; onPress: () => void; testId: string; tone?: 'danger'
}) {
  return (
    <Button
      data-testid={testId}
      variant="ghost"
      fullWidth
      aria-current={active ? 'page' : undefined}
      onPress={onPress}
      className={`h-9 justify-start gap-2.5 rounded-xl px-2.5 text-sm ${active ? 'bg-surface text-foreground shadow-sm' : tone === 'danger' ? 'text-danger' : 'text-muted'}`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {trailing ? <span className="ml-auto text-xs tabular-nums text-muted">{trailing}</span> : null}
    </Button>
  )
}

export function SidebarContents({ state, c, page, onPage, onNavigate }: { state: AppState; c: SmartWebController; page: Page; onPage: (p: Page) => void; onNavigate?: () => void }) {
  const visits = (cat: Category) => cardsOf(cat).reduce((n, id) => n + (state.engaged[id] ?? 0), 0)
  return (
    <div className="flex h-full flex-col gap-6 px-3 py-5">
      <div className="flex items-center gap-2.5 px-2">
        <Mark />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">smart-web</span>
          <span className="text-xs text-muted">Learns your layout</span>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Pages">
        <NavItem testId="nav-overview" icon={LayoutCells} label="Overview" active={page === 'overview'} onPress={() => { onPage('overview'); onNavigate?.() }} />
      </nav>
      <nav className="flex flex-col gap-0.5" aria-label="Categories" data-testid="nav-categories">
        <span className="px-2.5 pb-1 text-xs text-muted">Categories</span>
        {/* Learned order: the categories you use most move up (same model, same hysteresis as the cards). */}
        {state.navOrder.map((cat) => (
          <motion.div key={cat} layout data-nav={cat} transition={{ type: 'spring', stiffness: 300, damping: 32 }}>
            <NavItem
              testId={`nav-${cat}`}
              icon={CATEGORY_ICON[cat]}
              label={CATEGORY_INFO[cat].title}
              active={page === 'category' && state.category === cat}
              trailing={visits(cat) || null}
              onPress={() => { onPage('category'); void c.enter(cat); onNavigate?.() }}
            />
          </motion.div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <NavItem testId="nav-model" icon={Cpu} label="Model" active={page === 'model'} onPress={() => { onPage('model'); onNavigate?.() }} />
        <p className="px-2.5 text-xs text-muted">
          {state.netSource === 'cssnet' ? 'Ranking runs in CSS' : 'Ranking runs in JavaScript'} · {state.workerKind === 'worker' ? 'trained in a worker' : 'trained in-thread'}
        </p>
      </div>
    </div>
  )
}

export const Sidebar = memo(function Sidebar({ state, c, page, onPage }: { state: AppState; c: SmartWebController; page: Page; onPage: (p: Page) => void }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-separator lg:block">
      <SidebarContents state={state} c={c} page={page} onPage={onPage} />
    </aside>
  )
}, (a, b) => a.page === b.page && a.state.category === b.state.category && a.state.navOrder === b.state.navOrder && a.state.engaged === b.state.engaged && a.state.netSource === b.state.netSource && a.state.workerKind === b.state.workerKind)

export const Navbar = memo(function Navbar({ state, c, page, onPage, debugOpen, onToggleDebug }: { state: AppState; c: SmartWebController; page: Page; onPage: (p: Page) => void; debugOpen: boolean; onToggleDebug: () => void }) {
  const [menu, setMenu] = useState(false)
  const info = page === 'category' ? { ...CATEGORY_INFO[state.category], lede: `${CATEGORY_INFO[state.category].lede} Ordered by how you use it.` } : PAGE_INFO[page]
  return (
    <header className="flex items-center gap-3 px-4 pb-2 pt-6 sm:px-6 lg:px-8">
      <Drawer isOpen={menu} onOpenChange={setMenu}>
        <Button isIconOnly variant="ghost" aria-label="Open navigation" className="rounded-full lg:hidden" onPress={() => setMenu(true)}>
          <Bars className="size-4" />
        </Button>
        <Drawer.Backdrop>
          <Drawer.Content placement="left" className="w-72">
            <Drawer.Dialog aria-label="Navigation">
              <Drawer.Body className="p-0">
                {/* Mobile copy: test ids stay unique on the desktop sidebar. */}
                <MobileNav state={state} c={c} page={page} onPage={onPage} onNavigate={() => setMenu(false)} />
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
      <div className="flex min-w-0 flex-col">
        <h1 className="truncate text-xl font-semibold tracking-tight">{info.title}</h1>
        <p className="truncate text-sm text-muted">{info.lede}</p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button data-testid="replay-journey" size="sm" variant="secondary" isDisabled={!state.ready || state.replaying} onPress={() => c.replay()}>
          <Play className="size-4" />
          {state.replaying ? 'Replaying…' : 'Replay'}
        </Button>
        <Tooltip delay={300}>
          <Button data-testid="debug-toggle" isIconOnly size="sm" variant="tertiary" aria-label={debugOpen ? 'Hide debug' : 'Show debug'} aria-expanded={debugOpen} onPress={onToggleDebug}>
            <Sliders className="size-4" />
          </Button>
          <Tooltip.Content>{debugOpen ? 'Hide debug' : 'Debug'}</Tooltip.Content>
        </Tooltip>
      </div>
    </header>
  )
}, (a, b) => a.page === b.page && a.debugOpen === b.debugOpen && a.state.category === b.state.category && a.state.ready === b.state.ready && a.state.replaying === b.state.replaying)

/** Category switcher for the mobile drawer (no test ids, so the desktop ones stay unique). */
function MobileNav({ state, c, page, onPage, onNavigate }: { state: AppState; c: SmartWebController; page: Page; onPage: (p: Page) => void; onNavigate: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Pages">
      {(['overview'] as const).map((pg) => (
        <Button key={pg} variant="ghost" fullWidth onPress={() => { onPage(pg); onNavigate() }}
          className={`h-10 justify-start gap-2.5 rounded-xl px-2.5 ${page === pg ? 'bg-surface shadow-sm' : 'text-muted'}`}>
          {pg === 'overview' ? <LayoutCells className="size-4" /> : <Cpu className="size-4" />}{PAGE_INFO[pg].title}
        </Button>
      ))}
      {state.navOrder.map((cat) => {
        const Icon = CATEGORY_ICON[cat]
        return (
          <Button key={cat} variant="ghost" fullWidth onPress={() => { onPage('category'); void c.enter(cat); onNavigate() }}
            className={`h-10 justify-start gap-2.5 rounded-xl px-2.5 ${page === 'category' && state.category === cat ? 'bg-surface shadow-sm' : 'text-muted'}`}>
            <Icon className="size-4" />{CATEGORY_INFO[cat].title}
          </Button>
        )
      })}
      <Button variant="ghost" fullWidth onPress={() => { onPage('model'); onNavigate() }}
        className={`mt-4 h-10 justify-start gap-2.5 rounded-xl px-2.5 ${page === 'model' ? 'bg-surface shadow-sm' : 'text-muted'}`}>
        <Cpu className="size-4" />{PAGE_INFO.model.title}
      </Button>
    </nav>
  )
}
