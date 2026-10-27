import { memo, type ComponentType } from 'react'
import { Button, Card } from '@heroui/react'
import { BookOpen, Compass, Heart, House } from '@gravity-ui/icons'
import { CARDS, CARD_IDS, CATEGORIES, type CardId, type Category } from '../cssnet/contract'
import { CARD_INFO, CATEGORY_INFO } from './catalog'
import type { AppState } from './controller'
import { ago, agenda, clock, until, useNow } from './content'
import { PHOTOS } from './photos'

const ICON: Record<Category, ComponentType<{ className?: string }>> = { home: House, explore: Compass, library: BookOpen }
const categoryOf = (id: CardId) => CARDS[CARD_IDS.indexOf(id)].category as Category
const VERB_TEXT: Record<string, string> = { open: 'Opened', favorite: 'Favorited', unfavorite: 'Unfavorited', share: 'Shared', search: 'Found', query: 'Searched for' }

function Thumb({ id }: { id: CardId }) {
  const Icon = ICON[categoryOf(id)]
  const src = PHOTOS[id]
  return (
    <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-secondary text-muted">
      {src ? <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" /> : <Icon className="size-5" />}
    </span>
  )
}

/**
 * Jump back in: cards you have actually used (opened or favorited), in the learned orders and
 * the learned space order, so the page leads with whatever you reach for most. Empty slots are
 * filled from the same orders and labelled as suggestions, never presented as something you used.
 */
const JumpBackIn = memo(function JumpBackIn({ state, onOpen }: { state: AppState; onOpen: (id: CardId) => void }) {
  const used = (id: CardId) => (state.engaged[id] ?? 0) > 0 || !!state.favorites[id]
  // Rank-major over the spaces in sidebar order: every space's #1, then every #2, ...
  const ranked = [0, 1, 2, 3, 4, 5].flatMap((r) => state.navOrder.map((cat) => state.orders[cat][r]))
  const picks = [...ranked.filter(used), ...ranked.filter((id) => !used(id))].slice(0, 4)
  const anyUsed = picks.some(used)
  return (
    <section className="flex flex-col gap-3" aria-label="Jump back in">
      <h2 className="text-base font-medium tracking-tight">{anyUsed ? 'Jump Back In' : 'Suggested for You'}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {picks.map((id) => (
          <Card key={id} className="rounded-2xl p-0" data-jump={id} data-suggested={used(id) ? undefined : ''}>
            <Button variant="ghost" className="h-auto w-full justify-start gap-3 rounded-2xl p-3 text-left" onPress={() => onOpen(id)}>
              <Thumb id={id} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{CARD_INFO[id].title}</span>
                <span className="truncate text-xs text-muted">
                  {anyUsed && !used(id) ? 'Suggested' : CATEGORY_INFO[categoryOf(id)].title} · {CARD_INFO[id].desc}
                </span>
              </span>
            </Button>
          </Card>
        ))}
      </div>
    </section>
  )
}, (a, b) => a.state.orders === b.state.orders && a.state.navOrder === b.state.navOrder && a.state.engaged === b.state.engaged && a.state.favorites === b.state.favorites)

function UpNext() {
  const t = useNow()
  const events = agenda(t)
  return (
    <Card className="rounded-2xl p-5">
      <Card.Header className="gap-0.5">
        <Card.Title className="text-base">Up Next</Card.Title>
        <Card.Description className="text-sm text-muted">{events[0].title} {until(t, events[0].at)}</Card.Description>
      </Card.Header>
      <Card.Content className="pt-3">
        <ol className="flex flex-col gap-4">
          {events.map((e, i) => (
            <li key={e.title} className="grid grid-cols-[4.5rem_1fr] gap-3 text-sm">
              <span className="tabular-nums text-muted">{clock(e.at)}</span>
              <span className={`flex flex-col border-l-2 pl-3 ${i === 0 ? 'border-accent' : 'border-separator'}`}>
                <span className="font-medium">{e.title}</span>
                <span className="text-xs text-muted">{e.mins} min · {e.with}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card.Content>
    </Card>
  )
}

const RecentlyUsed = memo(function RecentlyUsed({ state }: { state: AppState }) {
  const t = useNow()
  // One line per card: the latest thing you did with it.
  const seen = new Set<CardId>()
  const items = state.activity.filter((a) => a.verb !== 'query' && !seen.has(a.card) && seen.add(a.card)).slice(0, 5)
  return (
    <Card data-testid="recent" className="rounded-2xl p-5">
      <Card.Header className="gap-0.5">
        <Card.Title className="text-base">Recent</Card.Title>
        <Card.Description className="text-sm text-muted">The cards you used last</Card.Description>
      </Card.Header>
      <Card.Content className="pt-3">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Things you open will show up here.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((a) => (
              <li key={`${a.at}-${a.card}`} className="flex items-center gap-3 text-sm">
                <Thumb id={a.card} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{CARD_INFO[a.card].title}</span>
                  <span className="truncate text-xs text-muted">{VERB_TEXT[a.verb] ?? 'Used'} in {CATEGORY_INFO[a.category].title}</span>
                </span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">{ago(t, a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  )
}, (a, b) => a.state.activity === b.state.activity)

const Favorites = memo(function Favorites({ state, onOpen }: { state: AppState; onOpen: (id: CardId) => void }) {
  const favs = CARD_IDS.filter((id) => state.favorites[id])
  return (
    <Card className="rounded-2xl p-5">
      <Card.Header className="gap-0.5">
        <Card.Title className="text-base">Favorites</Card.Title>
        <Card.Description className="text-sm text-muted">{favs.length ? `${favs.length} saved` : 'Tap the heart on any card'}</Card.Description>
      </Card.Header>
      <Card.Content className="pt-3">
        {favs.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted"><Heart className="size-4" />Nothing here yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {favs.map((id) => (
              <li key={id}>
                <Button variant="ghost" fullWidth className="h-auto justify-start gap-3 rounded-xl px-2 py-1.5 text-left" onPress={() => onOpen(id)}>
                  <Thumb id={id} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{CARD_INFO[id].title}</span>
                    <span className="truncate text-xs text-muted">{CATEGORY_INFO[categoryOf(id)].title}</span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  )
}, (a, b) => a.state.favorites === b.state.favorites)

/** Where your time went: opens per space. */
const Spaces = memo(function Spaces({ state }: { state: AppState }) {
  const counts = CATEGORIES.map((cat) => CARD_IDS.filter((id) => categoryOf(id) === cat).reduce((n, id) => n + (state.engaged[id] ?? 0), 0))
  const max = Math.max(1, ...counts)
  return (
    <Card className="rounded-2xl p-5">
      <Card.Header className="gap-0.5">
        <Card.Title className="text-base">Your Spaces</Card.Title>
        <Card.Description className="text-sm text-muted">{counts.reduce((a, b) => a + b, 0)} opens so far</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4 pt-3">
        {CATEGORIES.map((cat, i) => (
          <div key={cat} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span>{CATEGORY_INFO[cat].title}</span>
              <span className="tabular-nums text-muted">{counts[i]}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-secondary">
              <div className="h-2 rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(counts[i] / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </Card.Content>
    </Card>
  )
}, (a, b) => a.state.engaged === b.state.engaged)

export function TodayPage({ state, onOpen }: { state: AppState; onOpen: (id: CardId) => void }) {
  return (
    <>
      <JumpBackIn state={state} onOpen={onOpen} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <UpNext />
        <RecentlyUsed state={state} />
        <div className="flex flex-col gap-4">
          <Favorites state={state} onOpen={onOpen} />
          <Spaces state={state} />
        </div>
      </div>
    </>
  )
}
