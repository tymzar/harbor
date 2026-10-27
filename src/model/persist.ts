import { del, get, set } from 'idb-keyval'
import { SAVE_DEBOUNCE_MS, STORE_KEY } from './config'
import type { PersistedModel } from './types'

export interface ModelStore {
  load(): Promise<PersistedModel | undefined>
  save(m: PersistedModel): Promise<void>
  clear(): Promise<void>
}

export const idbStore: ModelStore = {
  load: () => get<PersistedModel>(STORE_KEY),
  save: (m) => set(STORE_KEY, m),
  clear: () => del(STORE_KEY),
}

export function memoryStore(): ModelStore & { data: PersistedModel | undefined; saves: number } {
  const s = {
    data: undefined as PersistedModel | undefined,
    saves: 0,
    load: async () => s.data,
    save: async (m: PersistedModel) => { s.data = structuredClone(m); s.saves++ },
    clear: async () => { s.data = undefined },
  }
  return s
}

/** Trailing-edge debounce: many calls within `ms` cause one save of the latest value. */
export function debouncedSaver(store: ModelStore, getValue: () => PersistedModel, ms = SAVE_DEBOUNCE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = async () => {
    if (timer) { clearTimeout(timer); timer = null }
    await store.save(getValue())
  }
  return {
    schedule(): void {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; void store.save(getValue()) }, ms)
    },
    flush,
    cancel(): void { if (timer) { clearTimeout(timer); timer = null } },
    get pending(): boolean { return timer !== null },
  }
}
