import { memo, useState, type ComponentType, type ReactNode } from 'react'
import { Avatar, Button, Chip, Drawer, Kbd, Popover, Tooltip } from '@heroui/react'
import { motion } from 'motion/react'
import { Bars, BellDot, BookOpen, Compass, Cpu, House, Magnifier, Sparkles, Sun } from '@gravity-ui/icons'
import { cardsOf, type Category } from '../cssnet/contract'
import { CATEGORY_INFO } from './catalog'
import type { AppState, SmartWebController } from './controller'
import { useHeldOrder } from './hold'
import { NOTIFICATIONS, PRODUCT, USER, ago, greeting, longDate, useNow } from './content'

export type Page = 'overview' | 'category' | 'model'
export const PAGE_INFO: Record<Exclude<Page, 'category'>, { title: string; lede: string }> = {
  overview: { title: 'Today', lede: '' },
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

/**
 * Memoised without comparing `onPress`: every caller's handler closes over values that are
 * stable for a given item (the controller, the page setter, the item's category), so a skipped
 * render keeps an equivalent handler. A card press re-renders only the item whose count changed.
 */
const NavItem = memo(function NavItem({ icon: Icon, label, active, trailing, onPress, testId, tone }: {
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
}, (a, b) => a.icon === b.icon && a.label === b.label && a.active === b.active && a.trailing === b.trailing && a.testId === b.testId && a.tone === b.tone)

export function SidebarContents({ state, c, page, onPage, onNavigate }: { state: AppState; c: SmartWebController; page: Page; onPage: (p: Page) => void; onNavigate?: () => void }) {
  const visits = (cat: Category) => cardsOf(cat).reduce((n, id) => n + (state.engaged[id] ?? 0), 0)
  // Held while the pointer is over the list, like the card grid: a space never slides under the cursor.
  const nav = useHeldOrder(state.navOrder)
  return (
    <div className="flex h-full flex-col gap-6 px-3 py-5">
      <div className="flex items-center gap-2.5 px-2">
        <Mark />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">{PRODUCT.name}</span>
          <span className="text-xs text-muted">{PRODUCT.tagline}</span>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Pages">
        <NavItem testId="nav-overview" icon={Sun} label="Today" active={page === 'overview'} onPress={() => { onPage('overview'); onNavigate?.() }} />
      </nav>
      <nav className="flex flex-col gap-0.5" aria-label="Categories" data-testid="nav-categories" data-order-pending={nav.pending ? '' : undefined} onPointerEnter={nav.onPointerEnter} onPointerLeave={nav.onPointerLeave}>
        <span className="px-2.5 pb-1 text-xs text-muted">Spaces</span>
        {/* Learned order: the categories you use most move up (same model, same hysteresis as the cards). */}
        {/* layoutDependency: measure only when the order changes, not on every visit count update. */}
        {nav.shown.map((cat, i) => (
          <motion.div key={cat} layout layoutDependency={i} data-nav={cat} transition={{ type: 'spring', stiffness: 300, damping: 32 }}>
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
        <UserRow />
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

function UserRow() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <Avatar size="sm" color="accent" variant="soft"><Avatar.Fallback>{USER.initials}</Avatar.Fallback></Avatar>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium">{USER.name}</span>
        <span className="truncate text-xs text-muted">{USER.email}</span>
      </div>
    </div>
  )
}

function Notifications({ onOpenCard }: { onOpenCard: (cat: Category) => void }) {
  const t = useNow()
  return (
    <Popover>
      <Tooltip delay={400}>
        <Button isIconOnly size="sm" variant="tertiary" aria-label="Notifications"><BellDot className="size-4" /></Button>
        <Tooltip.Content>Notifications</Tooltip.Content>
      </Tooltip>
      <Popover.Content placement="bottom end" className="w-80">
        <Popover.Dialog className="p-2">
          <Popover.Heading className="px-2 pb-1 pt-1 text-sm font-medium">Notifications</Popover.Heading>
          <ul className="flex flex-col">
            {NOTIFICATIONS.map((n) => (
              <li key={n.text}>
                <Button variant="ghost" fullWidth className="h-auto flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-left" onPress={() => onOpenCard('home')}>
                  <span className="text-sm">{n.text}</span>
                  <span className="text-xs text-muted">{n.at ? ago(t, t - n.at) : 'in a few minutes'}</span>
                </Button>
              </li>
            ))}
          </ul>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}

function Heading({ state, page }: { state: AppState; page: Page }) {
  const t = useNow()
  if (page === 'overview') return <TitleBlock title={`${greeting(t)}, ${USER.first}`} lede={longDate(t)} />
  if (page === 'model') return <TitleBlock title={PAGE_INFO.model.title} lede={PAGE_INFO.model.lede} />
  const info = CATEGORY_INFO[state.category]
  return (
    <TitleBlock title={info.title} lede={info.lede} badge={
      <Tooltip delay={300}>
        <Button size="sm" variant="ghost" aria-label="Arranged for you" className="h-6 min-w-0 rounded-full px-0">
          <Chip size="sm" variant="soft" color="accent" className="gap-1"><Sparkles className="size-3" />Arranged for you</Chip>
        </Button>
        <Tooltip.Content className="max-w-60">The cards you reach for most move to the front. It learns on this device only.</Tooltip.Content>
      </Tooltip>
    } />
  )
}

function TitleBlock({ title, lede, badge }: { title: string; lede: string; badge?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-2">
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {badge}
      </div>
      <p className="truncate text-sm text-muted">{lede}</p>
    </div>
  )
}

export const Navbar = memo(function Navbar({ state, c, page, onPage, onSearch, onOpenCategory }: { state: AppState; c: SmartWebController; page: Page; onPage: (p: Page) => void; onSearch: () => void; onOpenCategory: (cat: Category) => void }) {
  const [menu, setMenu] = useState(false)
  return (
    <header className="flex items-center gap-3 px-4 pb-2 pt-8 sm:px-6 lg:px-8">
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
      <Heading state={state} page={page} />
      <div className="ml-auto flex items-center gap-2">
        <Button data-testid="search-open" size="sm" variant="tertiary" aria-label="Search" onPress={onSearch} className="gap-2">
          <Magnifier className="size-4" />
          <span className="hidden sm:inline">Search</span>
          <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
        </Button>
        <Notifications onOpenCard={onOpenCategory} />
      </div>
    </header>
  )
}, (a, b) => a.page === b.page && a.state.category === b.state.category)

/** Category switcher for the mobile drawer (no test ids, so the desktop ones stay unique). */
function MobileNav({ state, c, page, onPage, onNavigate }: { state: AppState; c: SmartWebController; page: Page; onPage: (p: Page) => void; onNavigate: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Pages">
      {(['overview'] as const).map((pg) => (
        <Button key={pg} variant="ghost" fullWidth onPress={() => { onPage(pg); onNavigate() }}
          className={`h-10 justify-start gap-2.5 rounded-xl px-2.5 ${page === pg ? 'bg-surface shadow-sm' : 'text-muted'}`}>
          <Sun className="size-4" />{PAGE_INFO[pg].title}
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
