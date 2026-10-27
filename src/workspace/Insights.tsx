import { Button, Drawer } from '@heroui/react'
import { ArrowRotateLeft } from '@gravity-ui/icons'
import { ACTION_META } from './Messages'
import type { ActionKey, Group } from './brain'
import { useBrain, useChat, useCove } from './context'

const GROUP_TITLE: Record<Group, string> = { channels: 'Channels', dms: 'Direct messages', actions: 'Message actions' }

/** "How Cove sorts": the learned orders and what drives them. The ML lives here, not in the chat. */
export function Insights({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { brain } = useCove()
  const b = useBrain()
  const s = useChat()
  const label = (g: Group, id: string) =>
    g === 'actions' ? ACTION_META[id as ActionKey].label : g === 'channels' ? `#${id}` : s.channels.find((c) => c.id === id)?.name ?? id
  return (
    <Drawer isOpen={open} onOpenChange={onOpenChange}>
      <Drawer.Backdrop>
        <Drawer.Content placement="right" className="w-full max-w-md">
          <Drawer.Dialog aria-label="How Cove sorts" data-testid="insights">
            <Drawer.Body className="flex flex-col gap-6 p-6 pt-10">
              <header className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold tracking-tight">How Cove Sorts</h2>
                <p className="text-sm text-muted">
                  Channels, people and message actions you use most move up. Opening counts, sending counts more,
                  and nothing moves while your pointer is over a list. It learns on this device only.
                </p>
              </header>
              <dl className="grid grid-cols-3 gap-2">
                {[
                  ['Learned from', `${b.examples} actions`],
                  ['Network share', `${Math.round(b.alpha * 100)}%`],
                  ['Computed by', b.netSource === 'cssnet' ? 'CSS' : 'JavaScript'],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5 rounded-xl bg-surface-secondary px-3 py-2">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="text-sm font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              {(['channels', 'dms', 'actions'] as Group[]).map((g) => {
                const order = b.orders[g]
                const max = Math.max(1e-6, ...order.map((id) => b.scores[id] ?? 0))
                const parity = b.parity[g]
                return (
                  <section key={g} className="flex flex-col gap-2" data-testid={`insights-${g}`}>
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-sm font-medium">{GROUP_TITLE[g]}</h3>
                      <span className="text-xs text-muted">
                        {(b.evidence[g] ?? 0) < 1.8 ? 'default order' : 'learned'}
                        {parity !== undefined && !Number.isNaN(parity) ? ` · CSS = JS within ${parity.toExponential(0)}` : ''}
                      </span>
                    </div>
                    <ol className="flex flex-col gap-1.5">
                      {order.map((id, i) => (
                        <li key={id} className="grid grid-cols-[1.25rem_8.5rem_1fr] items-center gap-2 text-sm">
                          <span className="tabular-nums text-muted">{i + 1}</span>
                          <span className="truncate">{label(g, id)}</span>
                          <span className="h-1.5 rounded-full bg-surface-secondary">
                            <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${((b.scores[id] ?? 0) / max) * 100}%` }} />
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )
              })}
              <Button data-testid="reset-learning" variant="danger-soft" className="self-start" onPress={() => void brain.reset()}>
                <ArrowRotateLeft className="size-4" />Reset Learning
              </Button>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  )
}
