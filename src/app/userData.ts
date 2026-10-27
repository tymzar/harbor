import { del, get, set } from 'idb-keyval'
import type { CardId } from '../cssnet/contract'
import type { ModelEvent } from '../model/types'

/**
 * What you did, as opposed to what the model learned: favorites, open counts and recent
 * activity. Kept in IndexedDB beside the model (its own key), cleared by Reset, and left out of
 * exports and share links, which carry the model only.
 */
export interface UserData {
  version: 1
  engaged: Partial<Record<CardId, number>>
  favorites: Partial<Record<CardId, boolean>>
  activity: (ModelEvent & { at: number })[]
}

const KEY = 'smart-web/user-v1'
export const ACTIVITY_KEEP = 50

export const userStore = {
  async load(): Promise<UserData | null> {
    const d = await get<UserData>(KEY)
    return d && d.version === 1 ? d : null
  },
  // async: idb-keyval throws synchronously where IndexedDB is missing (jsdom, blocked storage),
  // and callers handle failures through the returned promise.
  async save(d: UserData): Promise<void> { await set(KEY, d) },
  async clear(): Promise<void> { await del(KEY) },
}
