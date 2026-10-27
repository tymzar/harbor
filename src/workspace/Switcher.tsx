import { useEffect, useMemo, useRef, useState } from 'react'
import { Kbd, Modal } from '@heroui/react'
import { Hashtag, Lock, Magnifier } from '@gravity-ui/icons'
import { useBrain, useChat, useCove } from './context'
import { PersonAvatar } from './Sidebar'
import type { Channel } from './types'

/** 1 for a prefix of the name, 0.8 for a word prefix, 0.6 anywhere in the name, 0 otherwise. */
export function nameMatch(query: string, name: string): number {
  const q = query.trim().toLowerCase(), n = name.toLowerCase()
  if (!q) return 0
  if (n.startsWith(q)) return 1
  if (n.split(/[\s-]+/).some((w) => w.startsWith(q))) return 0.8
  return n.includes(q) ? 0.6 : 0
}

/**
 * Jump to (⌘K). With no query: your channels and DMs in learned order, interleaved by score.
 * With a query: 0.7 text match + 0.3 learned score. Picking one is explicit intent ('search');
 * closing after typing gives the top match a small interest signal ('query').
 */
export function Switcher({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (c: Channel) => void }) {
  const { brain, chat } = useCove()
  const s = useChat()
  const b = useBrain()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const picked = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const byId = useMemo(() => Object.fromEntries(s.channels.map((c) => [c.id, c])), [s.channels])

  const items: Channel[] = useMemo(() => {
    const learned = [...b.orders.channels, ...b.orders.dms].map((id) => byId[id])
    const score = (c: Channel) => b.scores[c.id] ?? 0
    if (!query.trim()) {
      // Interleave the two learned orders by score, keeping each list's own order.
      const ch = b.orders.channels.map((id) => byId[id]), dm = b.orders.dms.map((id) => byId[id])
      const out: Channel[] = []
      while (ch.length || dm.length) out.push(!dm.length || (ch.length && score(ch[0]) >= score(dm[0])) ? ch.shift()! : dm.shift()!)
      return out.slice(0, 9)
    }
    const max = Math.max(1e-6, ...learned.map(score))
    return learned
      .map((c) => ({ c, t: Math.max(nameMatch(query, c.name), c.topic.toLowerCase().includes(query.trim().toLowerCase()) ? 0.35 : 0) }))
      .filter((r) => r.t > 0)
      .sort((x, y) => (0.7 * y.t + 0.3 * score(y.c) / max) - (0.7 * x.t + 0.3 * score(x.c) / max))
      .map((r) => r.c)
  }, [query, b.orders, b.scores, byId])

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); picked.current = false; requestAnimationFrame(() => input.current?.focus()) }
  }, [open])
  useEffect(() => { setActive(0) }, [query])

  const close = (o: boolean) => {
    if (!o && !picked.current && query.trim() && items[0]) brain.engage(items[0].kind === 'dm' ? 'dms' : 'channels', items[0].id, 'query')
    onOpenChange(o)
  }
  const pick = (c: Channel) => {
    picked.current = true
    onOpenChange(false)
    onPick(c)
    brain.engage(c.kind === 'dm' ? 'dms' : 'channels', c.id, 'search')
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); pick(items[active]) }
  }

  return (
    <Modal isOpen={open} onOpenChange={close}>
      <Modal.Backdrop>
        <Modal.Container placement="top" size="md">
          <Modal.Dialog aria-label="Jump to" className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-separator px-4 py-3">
              <Magnifier className="size-4 text-muted" />
              <input
                ref={input}
                data-testid="switcher-input"
                role="combobox"
                aria-expanded
                aria-controls="switcher-results"
                aria-activedescendant={items[active] ? `sw-${items[active].id}` : undefined}
                aria-label="Jump to a channel or person"
                placeholder="Jump to a channel or person"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                className="w-full bg-transparent text-base outline-none placeholder:text-muted"
              />
              <Kbd>Esc</Kbd>
            </div>
            <ul id="switcher-results" role="listbox" aria-label={query.trim() ? 'Results' : 'Your conversations'} className="max-h-[60vh] overflow-y-auto p-2">
              {!query.trim() && <li role="presentation" className="px-3 pb-1 pt-1 text-xs text-muted">Your conversations</li>}
              {items.map((c, i) => {
                const p = c.kind === 'dm' ? s.people[c.members[0]] : null
                const unread = chat.unread(c.id)
                return (
                  <li key={c.id} id={`sw-${c.id}`} role="option" aria-selected={i === active} data-testid="switcher-result" data-channel={c.id}
                    onMouseMove={() => setActive(i)} onClick={() => pick(c)}
                    className={`flex cursor-[var(--cursor-interactive)] items-center gap-3 rounded-xl px-3 py-2 ${i === active ? 'bg-surface-secondary' : ''}`}>
                    {p ? <PersonAvatar p={p} presence /> : c.private ? <Lock className="size-4 text-muted" /> : <Hashtag className="size-4 text-muted" />}
                    <span className="flex min-w-0 flex-col">
                      <span className={`truncate text-sm ${unread ? 'font-semibold' : 'font-medium'}`}>{c.name}</span>
                      <span className="truncate text-xs text-muted">{p ? p.title : c.topic}</span>
                    </span>
                    {unread > 0 && <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">{unread} new</span>}
                  </li>
                )
              })}
              {query.trim() && items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{query}”.</li>}
            </ul>
            <div className="flex items-center gap-3 border-t border-separator px-4 py-2 text-xs text-muted">
              <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> to move</span><span><Kbd>↵</Kbd> to open</span>
              <span className="ml-auto">Ordered by how you use Cove</span>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
