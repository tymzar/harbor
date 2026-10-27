import { createContext, useContext, useSyncExternalStore } from 'react'
import type { CoveBrain } from './brain'
import type { ChatStore } from './store'

export interface Cove { chat: ChatStore; brain: CoveBrain }
export const CoveContext = createContext<Cove | null>(null)

export function useCove(): Cove {
  const c = useContext(CoveContext)
  if (!c) throw new Error('CoveContext missing')
  return c
}
export function useChat() {
  const { chat } = useCove()
  return useSyncExternalStore(chat.subscribe, chat.getState)
}
export function useBrain() {
  const { brain } = useCove()
  return useSyncExternalStore(brain.subscribe, brain.getState)
}

/** What the main pane shows. */
export type View = { kind: 'channel'; id: string } | { kind: 'mentions' } | { kind: 'saved' }
