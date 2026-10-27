/// <reference lib="webworker" />
import { idbStore } from './persist'
import { createHandler, type Envelope, type ModelRequest, type ModelResponse } from './protocol'

const handle = createHandler(idbStore)
const scope = self as unknown as DedicatedWorkerGlobalScope

// Serialise requests so training steps are applied in arrival order.
let chain: Promise<unknown> = Promise.resolve()
scope.onmessage = (e: MessageEvent<{ id: number; req: ModelRequest }>) => {
  const { id, req } = e.data
  chain = chain.then(async () => {
    let env: Envelope<ModelResponse>
    try {
      env = { id, ok: true, result: await handle(req) }
    } catch (err) {
      env = { id, ok: false, error: (err as Error).message }
    }
    scope.postMessage(env)
  })
}
