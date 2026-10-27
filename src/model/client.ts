import type { CardId, Category, Verb } from '../cssnet/contract'
import { idbStore, type ModelStore } from './persist'
import { createHandler, type Envelope, type ModelRequest, type ModelResponse } from './protocol'
import type { ModelSnapshot, Orders, PersistedModel } from './types'

type Transport = (req: ModelRequest) => Promise<ModelResponse>

function workerTransport(worker: Worker): Transport {
  let next = 1
  const waiting = new Map<number, { resolve: (r: ModelResponse) => void; reject: (e: Error) => void }>()
  worker.onmessage = (e: MessageEvent<Envelope<ModelResponse>>) => {
    const w = waiting.get(e.data.id)
    if (!w) return
    waiting.delete(e.data.id)
    if (e.data.ok && e.data.result) w.resolve(e.data.result)
    else w.reject(new Error(e.data.error ?? 'worker error'))
  }
  return (req) => new Promise((resolve, reject) => {
    const id = next++
    waiting.set(id, { resolve, reject })
    worker.postMessage({ id, req })
  })
}

function localTransport(store: ModelStore): Transport {
  const handle = createHandler(store)
  let chain: Promise<unknown> = Promise.resolve()
  return (req) => {
    const p = chain.then(() => handle(req))
    chain = p.catch(() => undefined)
    return p
  }
}

/** Main-thread handle to the model. Uses a Web Worker when available, otherwise runs in-thread. */
export class ModelClient {
  readonly kind: 'worker' | 'local'
  private readonly send: Transport
  private worker: Worker | null = null

  constructor(opts: { forceLocal?: boolean; store?: ModelStore } = {}) {
    if (!opts.forceLocal && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
        this.send = workerTransport(this.worker)
        this.kind = 'worker'
        return
      } catch {
        this.worker = null
      }
    }
    this.send = localTransport(opts.store ?? idbStore)
    this.kind = 'local'
  }

  private async snap(req: ModelRequest) {
    const r = await this.send(req)
    if (r.type !== 'snapshot') throw new Error(`expected snapshot, got ${r.type}`)
    return r
  }

  init(raw: Float32Array, category: Category, fragment?: string | null) { return this.snap({ type: 'init', raw: Array.from(raw), category, fragment }) }
  async predict(raw: Float32Array, category: Category): Promise<ModelSnapshot> { return (await this.snap({ type: 'predict', raw: Array.from(raw), category })).snapshot }
  async step(raw: Float32Array, card: CardId, verb: Verb, category: Category, t: number): Promise<ModelSnapshot> {
    return (await this.snap({ type: 'step', raw: Array.from(raw), card, verb, category, t })).snapshot
  }
  async visit(raw: Float32Array, category: Category, t: number): Promise<ModelSnapshot> { return (await this.snap({ type: 'visit', raw: Array.from(raw), category, t })).snapshot }
  async setOrders(orders: Orders, navOrder?: Category[] | null): Promise<void> { await this.send({ type: 'setOrders', orders, navOrder }) }
  async reset(raw: Float32Array, category: Category): Promise<ModelSnapshot> { return (await this.snap({ type: 'reset', raw: Array.from(raw), category })).snapshot }
  async importModel(model: PersistedModel, raw: Float32Array, category: Category): Promise<ModelSnapshot> { return (await this.snap({ type: 'import', model, raw: Array.from(raw), category })).snapshot }
  async importFragment(fragment: string, raw: Float32Array, category: Category): Promise<ModelSnapshot> { return (await this.snap({ type: 'importFragment', fragment, raw: Array.from(raw), category })).snapshot }
  async exportModel(): Promise<PersistedModel> {
    const r = await this.send({ type: 'export' })
    if (r.type !== 'model') throw new Error('bad export response')
    return r.model
  }
  async exportFragment(): Promise<string> {
    const r = await this.send({ type: 'exportFragment' })
    if (r.type !== 'fragment') throw new Error('bad fragment response')
    return r.fragment
  }
  async flush(): Promise<void> { await this.send({ type: 'flush' }) }
  terminate(): void { this.worker?.terminate() }
}
