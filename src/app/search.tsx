import { useEffect, useMemo, useRef, useState } from 'react'
import { Kbd, Modal } from '@heroui/react'
import { Magnifier } from '@gravity-ui/icons'
import { type CardId } from '../cssnet/contract'
import { CARD_INFO, CATEGORY_INFO } from './catalog'
import type { AppState, SmartWebController } from './controller'
import { forYou, rankResults } from './searchRank'

/**
 * Command palette. Results are ranked by the model (see searchRank.ts); picking one trains the
 * model as explicit intent, and closing after a query gives its top match a small interest signal.
 */
export function SearchPalette({ state, c, open, onOpenChange, onPicked }: {
  state: AppState; c: SmartWebController; open: boolean; onOpenChange: (o: boolean) => void; onPicked: () => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const picked = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => rankResults(query, state.scores, state.navOrder), [query, state.scores, state.navOrder])
  const sections = useMemo(() => forYou(state.orders, state.navOrder), [state.orders, state.navOrder])
  const items: CardId[] = query.trim() ? results.map((r) => r.id) : sections.flatMap((s) => s.ids)

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); picked.current = false; requestAnimationFrame(() => inputRef.current?.focus()) }
  }, [open])
  useEffect(() => { setActive(0) }, [query])

  const close = (o: boolean) => {
    if (!o && !picked.current && query.trim() && results[0]) void c.searchAbandon(results[0].id)
    onOpenChange(o)
  }
  const pick = (id: CardId) => {
    picked.current = true
    onPicked()
    onOpenChange(false)
    void c.searchPick(id)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); pick(items[active]) }
  }

  const row = (id: CardId, i: number, cat?: string) => (
    <li
      key={id}
      id={`search-opt-${id}`}
      role="option"
      aria-selected={i === active}
      data-testid="search-result"
      data-card={id}
      onMouseMove={() => setActive(i)}
      onClick={() => pick(id)}
      className={`flex cursor-[var(--cursor-interactive)] items-center gap-3 rounded-xl px-3 py-2 ${i === active ? 'bg-surface-secondary' : ''}`}
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{CARD_INFO[id].title}</span>
        <span className="truncate text-xs text-muted">{CARD_INFO[id].desc}</span>
      </div>
      {cat && <span className="ml-auto shrink-0 text-xs text-muted">{cat}</span>}
    </li>
  )

  let idx = -1
  return (
    <Modal isOpen={open} onOpenChange={close}>
      <Modal.Backdrop>
        <Modal.Container placement="top" size="md">
          <Modal.Dialog aria-label="Search" className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-separator px-4 py-3">
              <Magnifier className="size-4 text-muted" />
              <input
                ref={inputRef}
                data-testid="search-input"
                role="combobox"
                aria-expanded
                aria-controls="search-results"
                aria-activedescendant={items[active] ? `search-opt-${items[active]}` : undefined}
                aria-label="Search cards"
                placeholder="Search cards"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                className="w-full bg-transparent text-base outline-none placeholder:text-muted"
              />
              <Kbd>Esc</Kbd>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {query.trim() ? (
                results.length ? (
                  <ul id="search-results" role="listbox" aria-label="Results" className="flex flex-col">
                    {results.map((r) => row(r.id, ++idx, CATEGORY_INFO[r.category].title))}
                  </ul>
                ) : (
                  <p className="px-3 py-6 text-center text-sm text-muted">No cards match “{query}”.</p>
                )
              ) : (
                <ul id="search-results" role="listbox" aria-label="For you" className="flex flex-col gap-1">
                  {sections.map((s) => (
                    <li key={s.category} role="presentation">
                      <p className="px-3 pb-1 pt-2 text-xs text-muted">{CATEGORY_INFO[s.category].title}</p>
                      <ul role="presentation" className="flex flex-col">{s.ids.map((id) => row(id, ++idx))}</ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-separator px-4 py-2 text-xs text-muted">
              <span>Ranked by how you use each card</span>
              <span className="ml-auto flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
              <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
