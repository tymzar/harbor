import type { CardId, Category, Verb } from '../cssnet/contract'
import { ModelEngine } from './engine'
import { decodeFragment, encodeFragment } from './quantize'
import { debouncedSaver, type ModelStore } from './persist'
import type { ModelSnapshot, Orders, PersistedModel } from './types'

export type ModelRequest =
  | { type: 'init'; raw: number[]; category: Category; fragment?: string | null }
  | { type: 'predict'; raw: number[]; category: Category }
  | { type: 'step'; raw: number[]; card: CardId; verb: Verb; category: Category; t: number }
  | { type: 'visit'; raw: number[]; category: Category; t: number }
  | { type: 'setOrders'; orders: Orders; navOrder?: Category[] | null }
  | { type: 'reset'; raw: number[]; category: Category }
  | { type: 'export' }
  | { type: 'exportFragment' }
  | { type: 'import'; model: PersistedModel; raw: number[]; category: Category }
  | { type: 'importFragment'; fragment: string; raw: number[]; category: Category }
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
        return { type: 'snapshot', snapshot: engine.predict(req.raw, req.category), source, error }
      }
      case 'predict':
        return { type: 'snapshot', snapshot: engine.predict(req.raw, req.category) }
      case 'step': {
        const snapshot = engine.step(req.raw, req.card, req.verb, req.category, req.t)
        saver.schedule()
        return { type: 'snapshot', snapshot }
      }
      case 'visit': {
        const snapshot = engine.visit(req.raw, req.category, req.t)
        saver.schedule()
        return { type: 'snapshot', snapshot }
      }
      case 'setOrders':
        engine.setOrders(req.orders, req.navOrder)
        saver.schedule()
        return { type: 'ok' }
      case 'reset':
        saver.cancel()
        engine.reset()
        try { await store.clear() } catch { /* storage unavailable */ }
        return { type: 'snapshot', snapshot: engine.predict(req.raw, req.category) }
      case 'export':
        return { type: 'model', model: engine.toPersisted() }
      case 'exportFragment':
        return { type: 'fragment', fragment: encodeFragment(engine.toPersisted()) }
      case 'import':
        engine.load(req.model)
        await saver.flush()
        return { type: 'snapshot', snapshot: engine.predict(req.raw, req.category), source: 'fresh' }
      case 'importFragment':
        engine.load(decodeFragment(req.fragment, engine.toPersisted()))
        await saver.flush()
        return { type: 'snapshot', snapshot: engine.predict(req.raw, req.category), source: 'fragment' }
      case 'flush':
        await saver.flush()
        return { type: 'ok' }
    }
  }
}
