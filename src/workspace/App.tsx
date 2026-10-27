import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Button, Drawer, Dropdown, Popover, Toast, Tooltip, toast } from '@heroui/react'
import { At, Bars, Bookmark, Hashtag, House, Lock, PinFill, Sliders, Star, StarFill, Xmark } from '@gravity-ui/icons'
import { Composer } from './Composer'
import { useChat, useCove, type View } from './context'
import { Insights } from './Insights'
import { MessageList, MessageRow, type MessageHandlers } from './Messages'
import { PersonAvatar, Sidebar } from './Sidebar'
import { Switcher } from './Switcher'
import { MessageText, clockTime, dayLabel } from './text'
import type { Channel, Message } from './types'
import { useBrain } from './context'
import type { ActionKey } from './brain'

const groupOf = (c: Channel): 'dms' | 'channels' => (c.kind === 'dm' ? 'dms' : 'channels')

function Rail({ view, onView, onInsights }: { view: View; onView: (v: View) => void; onInsights: () => void }) {
  const s = useChat()
  const me = s.people.me
  const item = (label: string, icon: React.ReactNode, active: boolean, onPress: () => void, testId: string) => (
    <Tooltip delay={300}>
      <Button data-testid={testId} isIconOnly variant="ghost" aria-label={label} aria-current={active ? 'page' : undefined} onPress={onPress}
        className={`size-10 rounded-xl ${active ? 'bg-surface text-foreground shadow-sm' : 'text-muted'}`}>{icon}</Button>
      <Tooltip.Content placement="right">{label}</Tooltip.Content>
    </Tooltip>
  )
  return (
    <aside className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-separator py-4 md:flex" aria-label="Workspace">
      <img src="/cove.svg" alt="Cove" className="mb-2 size-9" />
      {item('Home', <House className="size-5" />, view.kind === 'channel', () => onView({ kind: 'channel', id: 'general' }), 'rail-home')}
      {item('Mentions', <At className="size-5" />, view.kind === 'mentions', () => onView({ kind: 'mentions' }), 'rail-mentions')}
      {item('Saved', <Bookmark className="size-5" />, view.kind === 'saved', () => onView({ kind: 'saved' }), 'rail-saved')}
      <Dropdown>
        <Button isIconOnly variant="ghost" aria-label="Your profile" className="mt-auto size-10 rounded-xl" data-testid="profile-menu">
          <PersonAvatar p={me} size="md" presence />
        </Button>
        <Dropdown.Popover placement="right bottom">
          <Dropdown.Menu aria-label="Profile" onAction={(k) => {
            if (k === 'insights') onInsights()
            else if (k === 'harbor') location.href = '/'
          }}>
            <Dropdown.Item id="who" textValue={me.name} isDisabled>
              <span className="flex flex-col"><span className="font-medium text-foreground">{me.name}</span><span className="text-xs text-muted">{me.title} · Active</span></span>
            </Dropdown.Item>
            <Dropdown.Item id="insights" textValue="How Cove sorts" data-testid="open-insights"><span className="flex items-center gap-2"><Sliders className="size-4" />How Cove sorts</span></Dropdown.Item>
            <Dropdown.Item id="harbor" textValue="Open Harbor">Open Harbor</Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </aside>
  )
}

function ChannelHeader({ c, onMenu, onThread }: { c: Channel; onMenu: () => void; onThread: (m: Message) => void }) {
  const { chat, brain } = useCove()
  const s = useChat()
  const starred = s.starred.includes(c.id)
  const pinned = (s.messages[c.id] ?? []).filter((m) => m.pinned)
  const p = c.kind === 'dm' ? s.people[c.members[0]] : null
  return (
    <header className="flex items-center gap-3 border-b border-separator px-5 py-3">
      <Button isIconOnly variant="ghost" aria-label="Open navigation" className="lg:hidden" onPress={onMenu}><Bars className="size-4" /></Button>
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-1.5">
          {p ? <PersonAvatar p={p} presence /> : c.private ? <Lock className="size-4" /> : <Hashtag className="size-4" />}
          <h1 data-testid="channel-title" className="truncate text-base font-semibold">{c.name}</h1>
          {c.kind === 'channel' && (
            <Tooltip delay={300}>
              <Button data-testid="star-channel" isIconOnly size="sm" variant="ghost" aria-label={starred ? 'Unstar channel' : 'Star channel'} aria-pressed={starred}
                className="size-7 min-w-7" onPress={() => brain.engage('channels', c.id, chat.toggleStar(c.id) ? 'star' : 'unstar')}>
                {starred ? <StarFill className="size-4 text-warning" /> : <Star className="size-4 text-muted" />}
              </Button>
              <Tooltip.Content>{starred ? 'Unstar' : 'Star'}</Tooltip.Content>
            </Tooltip>
          )}
        </div>
        <p className="truncate text-xs text-muted">{p ? `${p.title}${p.status ? ` · ${p.status}` : ''}` : c.topic}</p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {pinned.length > 0 && (
          <Popover>
            <Button size="sm" variant="tertiary" className="gap-1.5" aria-label={`${pinned.length} pinned`}><PinFill className="size-3.5" />{pinned.length}</Button>
            <Popover.Content placement="bottom end" className="w-96">
              <Popover.Dialog className="p-2">
                <Popover.Heading className="px-2 pb-1 text-sm font-medium">Pinned</Popover.Heading>
                <ul className="flex flex-col">
                  {pinned.map((m) => (
                    <li key={m.id}>
                      <Button variant="ghost" fullWidth className="h-auto flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-left" onPress={() => onThread(m)}>
                        <span className="text-xs text-muted">{s.people[m.author]?.name} · {dayLabel(m.at)}</span>
                        <span className="line-clamp-2 text-sm text-foreground"><MessageText text={m.text} people={s.people} /></span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        )}
        {c.kind === 'channel' && (
          <span className="hidden items-center gap-1.5 sm:flex" aria-label={`${c.members.length + 1} members`}>
            <span className="flex -space-x-1.5">{c.members.slice(0, 4).map((id) => <PersonAvatar key={id} p={s.people[id]} />)}</span>
            <span className="text-xs tabular-nums text-muted">{c.members.length + 1}</span>
          </span>
        )}
      </div>
    </header>
  )
}

function ThreadPanel({ parent, onClose, handlers }: { parent: Message; onClose: () => void; handlers: MessageHandlers }) {
  const { chat, brain } = useCove()
  const s = useChat()
  const b = useBrain()
  const live = chat.find(parent.id) ?? parent
  const ch = s.channels.find((c) => c.id === live.channel)!
  return (
    <aside data-testid="thread-panel" className="flex w-full shrink-0 flex-col border-l border-separator bg-background lg:w-[380px]" aria-label="Thread">
      <header className="flex items-center gap-2 border-b border-separator px-5 py-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-base font-semibold">Thread</h2>
          <p className="truncate text-xs text-muted">{ch.kind === 'dm' ? ch.name : `#${ch.name}`}</p>
        </div>
        <Button isIconOnly variant="ghost" aria-label="Close thread" className="ml-auto" onPress={onClose}><Xmark className="size-4" /></Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <MessageRow m={live} compact={false} people={s.people} order={b.orders.actions as ActionKey[]} saved={s.saved.includes(live.id)} handlers={handlers} inThread />
        <div className="flex items-center gap-3 px-5 py-2 text-xs text-muted">
          <span>{live.replies?.length ?? 0} {live.replies?.length === 1 ? 'reply' : 'replies'}</span><span className="h-px flex-1 bg-separator" />
        </div>
        {(live.replies ?? []).map((r, i, rs) => (
          <MessageRow key={r.id} m={r} compact={i > 0 && rs[i - 1].author === r.author && r.at - rs[i - 1].at < 300_000} people={s.people}
            order={b.orders.actions as ActionKey[]} saved={s.saved.includes(r.id)} handlers={handlers} inThread />
        ))}
      </div>
      <Composer testId="thread-composer" placeholder="Reply…" autoFocus onSend={(text) => {
        chat.send(live.channel, text, live.id)
        brain.engage(groupOf(ch), ch.id, 'send')
      }} />
    </aside>
  )
}

/** Mentions or Saved: messages from across the workspace, newest first, each linked to its channel. */
function Collection({ kind, onOpen, onMenu }: { kind: 'mentions' | 'saved'; onOpen: (c: Channel, m: Message) => void; onMenu: () => void }) {
  const s = useChat()
  const all = useMemo(() => Object.values(s.messages).flatMap((l) => l.flatMap((m) => [m, ...(m.replies ?? [])])), [s.messages])
  const list = (kind === 'saved'
    ? s.saved.map((id) => all.find((m) => m.id === id)).filter((m): m is Message => !!m)
    : all.filter((m) => m.author !== 'me' && (/@me\b/.test(m.text) || s.channels.find((c) => c.id === m.channel)?.kind === 'dm'))
  ).sort((a, b) => b.at - a.at).slice(0, 60)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-separator px-5 py-3">
        <Button isIconOnly variant="ghost" aria-label="Open navigation" className="lg:hidden" onPress={onMenu}><Bars className="size-4" /></Button>
        <div className="flex flex-col">
          <h1 className="text-base font-semibold">{kind === 'saved' ? 'Saved' : 'Mentions'}</h1>
          <p className="text-xs text-muted">{kind === 'saved' ? 'Messages you saved for later' : 'Messages that mention you, and your direct messages'}</p>
        </div>
      </header>
      <ul data-testid={`${kind}-list`} className="min-h-0 flex-1 overflow-y-auto p-3">
        {list.length === 0 && <li className="py-10 text-center text-sm text-muted">{kind === 'saved' ? 'Save a message from its hover menu to find it here.' : 'Nothing yet.'}</li>}
        {list.map((m) => {
          const c = s.channels.find((x) => x.id === m.channel)!
          const p = s.people[m.author]
          return (
            <li key={m.id}>
              <Button variant="ghost" fullWidth onPress={() => onOpen(c, m)} className="h-auto items-start justify-start gap-3 rounded-xl px-3 py-3 text-left">
                <PersonAvatar p={p} size="md" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs text-muted"><span className="font-semibold text-foreground">{p?.name}</span> in {c.kind === 'dm' ? 'a direct message' : `#${c.name}`} · {dayLabel(m.at)} {clockTime(m.at)}</span>
                  <span className="text-sm text-foreground [overflow-wrap:anywhere]"><MessageText text={m.text} people={s.people} /></span>
                </span>
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function App() {
  const { chat, brain } = useCove()
  const s = useChat()
  const [view, setView] = useState<View>({ kind: 'channel', id: 'general' })
  const [thread, setThread] = useState<Message | null>(null)
  const [switcher, setSwitcher] = useState(false)
  const [insights, setInsights] = useState(false)
  const [menu, setMenu] = useState(false)
  const [unreadSince, setUnreadSince] = useState<number | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view

  const channel = view.kind === 'channel' ? s.channels.find((c) => c.id === view.id) ?? null : null
  const messages = channel ? s.messages[channel.id] ?? [] : []

  const show = useCallback((v: View) => {
    setView(v)
    setMenu(false)
    if (v.kind === 'channel') {
      setUnreadSince(chat.getState().lastRead[v.id] ?? null)
      chat.markRead(v.id)
      setThread((t) => (t && t.channel === v.id ? t : null))
    } else setThread(null)
  }, [chat])
  const openChannel = useCallback((c: Channel) => show({ kind: 'channel', id: c.id }), [show])

  // First load: start unread markers for the opening channel.
  useEffect(() => { if (s.ready) setUnreadSince((u) => u ?? (chat.getState().lastRead.general ?? null)) }, [s.ready, chat])
  // Reading the open channel keeps it read as new messages arrive.
  useEffect(() => { if (channel && document.visibilityState === 'visible') chat.markRead(channel.id) }, [channel, messages.length, chat])

  // Colleagues' messages elsewhere: a toast for DMs and mentions.
  useEffect(() => {
    chat.onIncoming = (m) => {
      const v = viewRef.current
      const c = chat.getState().channels.find((x) => x.id === m.channel)
      if (!c || (v.kind === 'channel' && v.id === m.channel)) return
      if (c.kind !== 'dm' && !/@me\b/.test(m.text)) return
      const who = chat.getState().people[m.author]?.name ?? m.author
      toast(c.kind === 'dm' ? who : `${who} in #${c.name}`, {
        description: m.text.length > 90 ? `${m.text.slice(0, 90)}…` : m.text,
        indicator: <Avatar size="sm" color={chat.getState().people[m.author]?.color} variant="soft"><Avatar.Fallback>{chat.getState().people[m.author]?.initials}</Avatar.Fallback></Avatar>,
        actionProps: { children: 'Open', onPress: () => { show({ kind: 'channel', id: c.id }); brain.engage(groupOf(c), c.id, 'open') } },
        timeout: 6000,
      })
    }
    return () => { chat.onIncoming = null }
  }, [chat, brain, show])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSwitcher((o) => !o) }
      else if (e.key === 'Escape' && thread && !switcher) setThread(null)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [thread, switcher])

  const handlers: MessageHandlers = useMemo(() => ({
    onThread: (m: Message) => setThread(m),
    onChannel: (id: string) => {
      const c = chat.getState().channels.find((x) => x.id === id)
      if (c) { show({ kind: 'channel', id }); brain.engage(groupOf(c), id, 'open') }
    },
  }), [chat, brain, show])

  const typingId = channel ? s.typing[channel.id] : undefined
  const sidebar = <Sidebar view={view} onView={show} onSearch={() => setSwitcher(true)} />
  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground" data-cove-ready={s.ready ? '' : undefined}>
      <Rail view={view} onView={show} onInsights={() => setInsights(true)} />
      <aside className="hidden w-64 shrink-0 border-r border-separator lg:block">{sidebar}</aside>
      <Drawer isOpen={menu} onOpenChange={setMenu}>
        <Drawer.Backdrop>
          <Drawer.Content placement="left" className="w-72">
            <Drawer.Dialog aria-label="Navigation"><Drawer.Body className="p-0">{sidebar}</Drawer.Body></Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
      <main className={`min-w-0 flex-1 flex-col ${thread ? 'hidden lg:flex' : 'flex'}`}>
        {channel ? (
          <>
            <ChannelHeader c={channel} onMenu={() => setMenu(true)} onThread={setThread} />
            <MessageList key={`list-${channel.id}`} messages={messages} people={s.people} unreadSince={unreadSince} handlers={handlers}
              empty={channel.kind === 'dm' ? `This is the beginning of your conversation with ${channel.name}.` : undefined} />
            <Composer key={`composer-${channel.id}`} placeholder={channel.kind === 'dm' ? `Message ${channel.name}` : `Message #${channel.name}`}
              typing={typingId ? s.people[typingId]?.name.split(' ')[0] : undefined}
              onSend={(text) => { chat.send(channel.id, text); brain.engage(groupOf(channel), channel.id, 'send') }} />
          </>
        ) : view.kind !== 'channel' ? (
          <Collection kind={view.kind} onMenu={() => setMenu(true)} onOpen={(c, m) => {
            show({ kind: 'channel', id: c.id })
            brain.engage(groupOf(c), c.id, 'open')
            const parent = (s.messages[c.id] ?? []).find((x) => x.replies?.some((r) => r.id === m.id))
            if (parent) setThread(parent)
          }} />
        ) : null}
      </main>
      {thread && <ThreadPanel parent={thread} onClose={() => setThread(null)} handlers={handlers} />}
      <Switcher open={switcher} onOpenChange={setSwitcher} onPick={openChannel} />
      <Insights open={insights} onOpenChange={setInsights} />
      <Toast.Provider placement="bottom start" />
    </div>
  )
}
