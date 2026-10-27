import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, Dropdown, Tooltip, toast } from '@heroui/react'
import { ArrowShapeTurnUpLeft, Bookmark, BookmarkFill, Ellipsis, Link as LinkIcon, PinFill } from '@gravity-ui/icons'
import { useHeldOrder } from '../app/hold'
import type { ActionKey } from './brain'
import { useBrain, useCove } from './context'
import { PersonAvatar } from './Sidebar'
import { MessageText, ago, clockTime, dayLabel } from './text'
import type { Message, Person } from './types'

const GROUP_MS = 5 * 60_000

export const ACTION_META: Record<ActionKey, { label: string; emoji?: string }> = {
  'react-thumbs': { label: 'React 👍', emoji: '👍' },
  'react-check': { label: 'React ✅', emoji: '✅' },
  'react-eyes': { label: 'React 👀', emoji: '👀' },
  reply: { label: 'Reply in thread' },
  save: { label: 'Save for later' },
  'copy-link': { label: 'Copy link' },
}

export interface MessageHandlers {
  onThread: (m: Message) => void
  onChannel: (id: string) => void
}

/** Runs a message action: the side effect, plus a usage signal so the toolbar learns your habits. */
function useAction(handlers: MessageHandlers) {
  const { chat, brain } = useCove()
  return (key: ActionKey, m: Message) => {
    brain.engage('actions', key, 'open')
    const meta = ACTION_META[key]
    if (meta.emoji) chat.react(m.id, meta.emoji)
    else if (key === 'reply') handlers.onThread(m)
    else if (key === 'save') chat.toggleSaved(m.id) // the filled bookmark shows it; no toast over the toolbar
    else if (key === 'copy-link') {
      const url = `${location.origin}${location.pathname}#${m.channel}/${m.id}`
      void navigator.clipboard?.writeText(url).catch(() => undefined)
      toast('Link copied', { timeout: 2000 })
    }
  }
}

function ActionIcon({ k, saved }: { k: ActionKey; saved: boolean }) {
  const meta = ACTION_META[k]
  if (meta.emoji) return <span className="text-base leading-none">{meta.emoji}</span>
  if (k === 'reply') return <ArrowShapeTurnUpLeft className="size-4" />
  if (k === 'save') return saved ? <BookmarkFill className="size-4 text-accent" /> : <Bookmark className="size-4" />
  return <LinkIcon className="size-4" />
}

/** The hover toolbar: your three most-used actions, the rest under More, all in learned order. */
function Toolbar({ m, order: live, saved, run, onMenu }: { m: Message; order: readonly ActionKey[]; saved: boolean; run: (k: ActionKey, m: Message) => void; onMenu: (open: boolean) => void }) {
  // Frozen while More is open: the menu renders outside the list, so moving into it releases the
  // list's hold, and a re-rank would otherwise move items in or out of the menu you are reading.
  const frozen = useRef<readonly ActionKey[] | null>(null)
  const [, rerender] = useState(0)
  const order = frozen.current ?? live
  const top = order.slice(0, 3), rest = order.slice(3)
  return (
    <div data-testid="msg-toolbar" className="absolute -top-4 right-4 z-10 flex items-center gap-0.5 rounded-xl border border-separator bg-surface p-0.5 shadow-md">
      {top.map((k) => (
        <Tooltip key={k} delay={250}>
          <Button data-testid={`act-${k}`} data-action={k} isIconOnly size="sm" variant="ghost" aria-label={ACTION_META[k].label} className="size-8 min-w-8 rounded-lg" onPress={() => run(k, m)}>
            <ActionIcon k={k} saved={saved} />
          </Button>
          <Tooltip.Content>{k === 'save' && saved ? 'Remove from Saved' : ACTION_META[k].label}</Tooltip.Content>
        </Tooltip>
      ))}
      <Dropdown onOpenChange={(open) => {
        frozen.current = open ? order : null
        if (!open) rerender((n) => n + 1)
        onMenu(open)
      }}>
        <Button data-testid="act-more" isIconOnly size="sm" variant="ghost" aria-label="More actions" className="size-8 min-w-8 rounded-lg"><Ellipsis className="size-4" /></Button>
        <Dropdown.Popover placement="bottom end">
          <Dropdown.Menu aria-label="More actions" onAction={(key) => run(key as ActionKey, m)}>
            {rest.map((k) => (
              <Dropdown.Item key={k} id={k} textValue={ACTION_META[k].label} data-testid={`act-${k}`}>
                <span className="flex items-center gap-2"><ActionIcon k={k} saved={saved} />{k === 'save' && saved ? 'Remove from Saved' : ACTION_META[k].label}</span>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  )
}

function Reactions({ m, people }: { m: Message; people: Record<string, Person> }) {
  const { chat } = useCove()
  if (!m.reactions?.length) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {m.reactions.map((r) => {
        const mine = r.by.includes('me')
        const names = r.by.map((p) => (p === 'me' ? 'You' : people[p]?.name.split(' ')[0] ?? p)).join(', ')
        return (
          <Tooltip key={r.emoji} delay={300}>
            <Button size="sm" variant="ghost" aria-pressed={mine} aria-label={`${r.emoji} ${r.by.length}`} onPress={() => chat.react(m.id, r.emoji)}
              className={`h-6 min-w-0 gap-1 rounded-full border px-2 text-xs tabular-nums ${mine ? 'border-accent bg-accent-soft text-accent-soft-foreground' : 'border-separator bg-surface-secondary text-muted'}`}>
              <span className="text-sm leading-none">{r.emoji}</span>{r.by.length}
            </Button>
            <Tooltip.Content>{names}</Tooltip.Content>
          </Tooltip>
        )
      })}
    </div>
  )
}

export const MessageRow = memo(function MessageRow({ m, compact, people, order, saved, handlers, inThread }: {
  m: Message; compact: boolean; people: Record<string, Person>; order: readonly ActionKey[]; saved: boolean; handlers: MessageHandlers; inThread?: boolean
}) {
  const run = useAction(handlers)
  // The toolbar is mounted only for the row under the pointer or keyboard focus (and while its
  // More menu is open): one toolbar instead of one per message. Measured: a channel switch
  // rendered ~4 buttons + tooltips + a menu for every message.
  const [hot, setHot] = useState(false)
  const [menu, setMenu] = useState(false)
  const p = people[m.author]
  const replies = m.replies ?? []
  return (
    <div data-testid="message" data-id={m.id} className={`group relative flex gap-3 px-5 hover:bg-surface-secondary/60 ${compact ? 'py-0.5' : 'pt-2 pb-0.5'}`}
      onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHot(false) }}>
      <div className="w-9 shrink-0">
        {compact
          ? <span className="invisible block pt-1 text-right text-[10px] tabular-nums text-muted group-hover:visible">{clockTime(m.at)}</span>
          : <PersonAvatar p={p} size="md" />}
      </div>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{p?.name ?? m.author}</span>
            <span className="text-xs tabular-nums text-muted">{clockTime(m.at)}</span>
            {m.pinned && <span className="flex items-center gap-1 text-xs text-muted"><PinFill className="size-3" />Pinned</span>}
          </div>
        )}
        <div className="text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
          <MessageText text={m.text} people={people} onChannel={handlers.onChannel} />
        </div>
        <Reactions m={m} people={people} />
        {!inThread && replies.length > 0 && (
          <Button data-testid="thread-summary" variant="ghost" size="sm" onPress={() => handlers.onThread(m)}
            className="-ml-1 mt-1 h-7 justify-start gap-2 rounded-lg px-1 text-xs">
            <span className="flex -space-x-1">{[...new Set(replies.map((r) => r.author))].slice(0, 3).map((a) => <PersonAvatar key={a} p={people[a]} />)}</span>
            <span className="font-semibold text-accent">{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
            <span className="text-muted">Last reply {ago(replies[replies.length - 1].at)}</span>
          </Button>
        )}
      </div>
      {(hot || menu) && <Toolbar m={m} order={order} saved={saved} run={run} onMenu={setMenu} />}
    </div>
  )
})

/**
 * A channel's messages: day dividers, grouping of consecutive messages from one author, and a
 * "New" divider at the first message you had not read when you opened the channel.
 */
export function MessageList({ messages, people, unreadSince, handlers, empty }: {
  messages: Message[]; people: Record<string, Person>; unreadSince: number | null; handlers: MessageHandlers; empty?: string
}) {
  const b = useBrain()
  const { chat } = useCove()
  const saved = chat.getState().saved
  // The toolbar order is held while the pointer is over the list, like the sidebar.
  const actions = useHeldOrder(b.orders.actions as ActionKey[])
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const count = messages.length
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [count])
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => { atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  const firstUnread = unreadSince === null ? -1 : messages.findIndex((m) => m.at > unreadSince && m.author !== 'me')
  return (
    <div ref={scroller} data-testid="message-list" className="min-h-0 flex-1 overflow-y-auto pb-4 pt-3"
      data-order-pending={actions.pending ? '' : undefined} onPointerEnter={actions.onPointerEnter} onPointerLeave={actions.onPointerLeave}>
      {count === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{empty ?? 'No messages yet.'}</p>}
      {messages.map((m, i) => {
        const prev = messages[i - 1]
        const newDay = !prev || dayLabel(prev.at) !== dayLabel(m.at)
        const compact = !!prev && !newDay && prev.author === m.author && m.at - prev.at < GROUP_MS && i !== firstUnread
        return (
          <Fragment key={m.id}>
            {newDay && (
              <div className="sticky top-0 z-[5] flex items-center gap-3 bg-background/85 px-5 py-2 backdrop-blur-sm">
                <span className="h-px flex-1 bg-separator" />
                <span className="rounded-full border border-separator bg-background px-3 py-0.5 text-xs font-medium">{dayLabel(m.at)}</span>
                <span className="h-px flex-1 bg-separator" />
              </div>
            )}
            {i === firstUnread && (
              <div data-testid="new-divider" className="flex items-center gap-2 px-5 py-1">
                <span className="h-px flex-1 bg-danger" /><span className="text-xs font-semibold text-danger">New</span>
              </div>
            )}
            <MessageRow m={m} compact={compact} people={people} order={actions.shown as ActionKey[]} saved={saved.includes(m.id)} handlers={handlers} />
          </Fragment>
        )
      })}
    </div>
  )
}
