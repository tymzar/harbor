import { useState, type ReactNode } from 'react'
import { Avatar, Button, Kbd, Tooltip } from '@heroui/react'
import { At, Bookmark, ChevronDown, ChevronRight, Hashtag, Lock, Magnifier, PencilToSquare, Sparkles } from '@gravity-ui/icons'
import { useHeldOrder } from '../app/hold'
import { useBrain, useChat, useCove, type View } from './context'
import type { Channel, Person } from './types'

function Presence({ p, className = '' }: { p: Person; className?: string }) {
  return (
    <span aria-label={p.presence === 'active' ? 'Active' : 'Away'}
      className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background ${p.presence === 'active' ? 'bg-success' : 'bg-default'} ${className}`} />
  )
}

export function PersonAvatar({ p, size = 'sm', presence = false }: { p: Person; size?: 'sm' | 'md'; presence?: boolean }) {
  return (
    // Opaque base: soft avatar colours are translucent, so stacked avatars would show through each other.
    <span className={`relative inline-flex shrink-0 bg-background ${size === 'sm' ? 'rounded-md' : 'rounded-lg'}`}>
      <Avatar size={size} color={p.color} variant="soft" className={size === 'sm' ? 'size-6 rounded-md text-[10px] ring-2 ring-background' : 'size-9 rounded-lg text-xs'}>
        <Avatar.Fallback>{p.initials}</Avatar.Fallback>
      </Avatar>
      {presence && <Presence p={p} />}
    </span>
  )
}

function Item({ active, unread, mentions, onPress, children, testId, label }: {
  active: boolean; unread: boolean; mentions: number; onPress: () => void; children: ReactNode; testId: string; label: string
}) {
  return (
    <Button data-testid={testId} variant="ghost" fullWidth aria-label={label} aria-current={active ? 'page' : undefined} onPress={onPress}
      className={`h-8 justify-start gap-2 rounded-lg px-2 text-sm ${active ? 'bg-accent text-accent-foreground' : unread ? 'font-semibold text-foreground' : 'text-muted'}`}>
      {children}
      {mentions > 0 && <span className={`ml-auto min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums ${active ? 'bg-accent-foreground text-accent' : 'bg-danger text-danger-foreground'}`}>{mentions}</span>}
    </Button>
  )
}

function Section({ title, hint, open, onToggle, children, testId, held }: {
  title: string; hint?: boolean; open: boolean; onToggle: () => void; children: ReactNode; testId: string
  held?: ReturnType<typeof useHeldOrder<string>>
}) {
  return (
    <section data-testid={testId} className="flex flex-col gap-0.5"
      data-order-pending={held?.pending ? '' : undefined} onPointerEnter={held?.onPointerEnter} onPointerLeave={held?.onPointerLeave}>
      <div className="flex items-center gap-1 px-1">
        <Button variant="ghost" size="sm" onPress={onToggle} aria-expanded={open} className="h-7 justify-start gap-1 px-1 text-xs font-medium text-muted">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}{title}
        </Button>
        {hint && (
          <Tooltip delay={300}>
            <Button isIconOnly variant="ghost" size="sm" aria-label="Sorted for you" className="size-6 min-w-6 text-muted"><Sparkles className="size-3" /></Button>
            <Tooltip.Content className="max-w-56">Sorted by how you use them. Nothing moves while your pointer is over the list.</Tooltip.Content>
          </Tooltip>
        )}
      </div>
      {open && children}
    </section>
  )
}

export function Sidebar({ view, onView, onSearch }: { view: View; onView: (v: View) => void; onSearch: () => void }) {
  const { chat, brain } = useCove()
  const s = useChat()
  const b = useBrain()
  const [open, setOpen] = useState({ starred: true, channels: true, dms: true })
  const channels = useHeldOrder(b.orders.channels)
  const dms = useHeldOrder(b.orders.dms)
  const byId = Object.fromEntries(s.channels.map((c) => [c.id, c])) as Record<string, Channel>
  const go = (c: Channel) => {
    onView({ kind: 'channel', id: c.id })
    brain.engage(c.kind === 'dm' ? 'dms' : 'channels', c.id, 'open')
  }
  const isActive = (id: string) => view.kind === 'channel' && view.id === id
  const mentionsTotal = s.channels.reduce((n, c) => n + chat.mentions(c.id), 0)
  const channelRow = (id: string) => {
    const c = byId[id]
    return (
      <Item key={id} testId={`ch-${id}`} label={`#${c.name}`} active={isActive(id)} unread={chat.unread(id) > 0} mentions={chat.mentions(id)} onPress={() => go(c)}>
        {c.private ? <Lock className="size-3.5 shrink-0" /> : <Hashtag className="size-3.5 shrink-0" />}
        <span className="truncate">{c.name}</span>
      </Item>
    )
  }
  const starred = channels.shown.filter((id) => s.starred.includes(id))
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pb-2 pt-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground">N</span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">Northwind Studio</span>
          <span className="truncate text-xs text-muted">Cove workspace</span>
        </div>
        <Tooltip delay={300}>
          <Button isIconOnly variant="tertiary" size="sm" aria-label="New message" className="ml-auto" onPress={onSearch}><PencilToSquare className="size-4" /></Button>
          <Tooltip.Content>New message</Tooltip.Content>
        </Tooltip>
      </div>
      <div className="px-3 pb-3">
        <Button data-testid="switcher-open" variant="tertiary" size="sm" fullWidth className="justify-start gap-2 text-muted" onPress={onSearch}>
          <Magnifier className="size-4" />Jump to…<Kbd className="ml-auto">⌘K</Kbd>
        </Button>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-4" aria-label="Conversations">
        <div className="flex flex-col gap-0.5">
          <Item testId="view-mentions" label="Mentions" active={view.kind === 'mentions'} unread={mentionsTotal > 0} mentions={0} onPress={() => onView({ kind: 'mentions' })}>
            <At className="size-4 shrink-0" />Mentions{mentionsTotal > 0 && <span className="ml-auto text-xs tabular-nums text-muted">{mentionsTotal}</span>}
          </Item>
          <Item testId="view-saved" label="Saved" active={view.kind === 'saved'} unread={false} mentions={0} onPress={() => onView({ kind: 'saved' })}>
            <Bookmark className="size-4 shrink-0" />Saved{s.saved.length > 0 && <span className="ml-auto text-xs tabular-nums text-muted">{s.saved.length}</span>}
          </Item>
        </div>
        {starred.length > 0 && (
          <Section testId="section-starred" title="Starred" open={open.starred} onToggle={() => setOpen((o) => ({ ...o, starred: !o.starred }))}>
            {starred.map(channelRow)}
          </Section>
        )}
        <Section testId="section-channels" title="Channels" hint held={channels} open={open.channels} onToggle={() => setOpen((o) => ({ ...o, channels: !o.channels }))}>
          {channels.shown.filter((id) => !s.starred.includes(id)).map(channelRow)}
        </Section>
        <Section testId="section-dms" title="Direct messages" hint held={dms} open={open.dms} onToggle={() => setOpen((o) => ({ ...o, dms: !o.dms }))}>
          {dms.shown.map((id) => {
            const c = byId[id]
            const p = s.people[c.members[0]]
            return (
              <Item key={id} testId={`ch-${id}`} label={c.name} active={isActive(id)} unread={chat.unread(id) > 0} mentions={chat.mentions(id)} onPress={() => go(c)}>
                <PersonAvatar p={p} presence />
                <span className="truncate">{c.name}</span>
              </Item>
            )
          })}
        </Section>
      </nav>
    </div>
  )
}
