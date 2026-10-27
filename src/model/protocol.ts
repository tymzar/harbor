import type { ActionId } from '../cssnet/contract'
import { ModelEngine } from './engine'
import { decodeFragment, encodeFragment } from './quantize'
import { debouncedSaver, type ModelStore } from './persist'
import type { ModelSnapshot, PersistedModel } from './types'

export type ModelRequest =
  | { type: 'init'; raw: number[]; fragment?: string | null }
  | { type: 'predict'; raw: number[] }
  | { type: 'step'; raw: number[]; action: ActionId }
  | { type: 'reset'; raw: number[] }
  | { type: 'export' }
  | { type: 'exportFragment' }
  | { type: 'import'; model: PersistedModel; raw: number[] }
  | { type: 'importFragment'; fragment: string; raw: number[] }
  | { type: 'flush' }

export type ModelResponse =
  | { type: 'snapshot'; snapshot: ModelSnapshot; source?: 'fresh' | 'idb' | 'fragment' | 'fragment-error'; error?: string }
  | { type: 'model'; model: PersistedModel }
  | { type: 'fragment'; fragment: string }
  | { type: 'ok' }

export interface Envelope<T> { id: number; ok: boolean; result?: T; error?: string }

/** Shared message handler: used by the worker and by the in-thread fallback. */
export function createHandler(store: ModelStore, engine = new ModelEngine()) {
  const saver = debouncedSaver(store, () => engine.toPersisted())
  return async function handle(req: ModelRequest): Promise<ModelResponse> {
    switch (req.type) {
      case 'init': {
        let source: 'fresh' | 'idb' | 'fragment' | 'fragment-error' = 'fresh'
        let error: string | undefined
        try {
          const saved = await store.load()
          if (saved) { engine.load(saved); source = 'idb' }
        } catch (e) {
          error = `stored model ignored: ${(e as Error).message}`
        }
        if (req.fragment) {
          try {
            engine.load(decodeFragment(req.fragment, engine.toPersisted()))
            source = 'fragment'
            saver.schedule()
          } catch (e) {
            source = 'fragment-error'
            error = `fragment ignored: ${(e as Error).message}`
          }
        }
        return { type: 'snapshot', snapshot: engine.predict(req.raw), source, error }
      }
      case 'predict':
        return { type: 'snapshot', snapshot: engine.predict(req.raw) }
      case 'step': {
        const snapshot = engine.step(req.raw, req.action)
        saver.schedule()
        return { type: 'snapshot', snapshot }
      }
      case 'reset':
        saver.cancel()
        engine.reset()
        await store.clear()
        return { type: 'snapshot', snapshot: engine.predict(req.raw) }
      case 'export':
        return { type: 'model', model: engine.toPersisted() }
      case 'exportFragment':
        return { type: 'fragment', fragment: encodeFragment(engine.toPersisted()) }
      case 'import':
        engine.load(req.model)
        await saver.flush()
        return { type: 'snapshot', snapshot: engine.predict(req.raw), source: 'fresh' }
      case 'importFragment':
        engine.load(decodeFragment(req.fragment, engine.toPersisted()))
        await saver.flush()
        return { type: 'snapshot', snapshot: engine.predict(req.raw), source: 'fragment' }
      case 'flush':
        await saver.flush()
        return { type: 'ok' }
    }
  }
}
