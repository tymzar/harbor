import { Fragment, useRef } from 'react'
import { Button, Card } from '@heroui/react'
import { ArrowDownToLine, ArrowRotateLeft, ArrowUpFromLine, Link as LinkIcon } from '@gravity-ui/icons'
import type { AppState, SmartWebController } from './controller'

const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`

/** Model page header: how big the model is, and what you can do with it. */
export function ModelBar({ state, c }: { state: AppState; c: SmartWebController }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const m = state.modelSize
  const stats: [string, string, string][] = m
    ? [
        ['Weights', kb(m.float32Bytes), `${m.params} parameters, float32`],
        ['Saved model', kb(m.jsonBytes), 'IndexedDB / Export JSON'],
        ['Share link', kb(m.linkBytes), 'int8, in the URL fragment'],
        ['Presses learned', String(state.stats.examples), 'since the last reset'],
      ]
    : []
  return (
    <Card className="gap-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button data-testid="export-model" size="sm" variant="tertiary" isDisabled={!state.ready} onPress={() => void c.exportJson()}><ArrowDownToLine className="size-4" />Export JSON</Button>
        <Button data-testid="export-link" size="sm" variant="tertiary" isDisabled={!state.ready} onPress={() => void c.exportLink()}><LinkIcon className="size-4" />Copy Link</Button>
        <Button data-testid="import-model" size="sm" variant="tertiary" isDisabled={!state.ready} onPress={() => fileRef.current?.click()}><ArrowUpFromLine className="size-4" />Import</Button>
        <Button data-testid="reset-model" size="sm" variant="danger-soft" className="ml-auto" isDisabled={!state.ready} onPress={() => void c.reset().then(() => c.measureSize())}><ArrowRotateLeft className="size-4" />Reset Model</Button>
        <input
          ref={fileRef} data-testid="import-file" type="file" accept="application/json,.json" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) { await c.importJsonText(await f.text()); void c.measureSize() }
            e.target.value = ''
          }}
        />
      </div>
      <dl data-testid="model-size" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([k, v, note]) => (
          <Fragment key={k}>
            <div className="flex flex-col gap-0.5 rounded-xl bg-surface-secondary px-3 py-2">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums leading-tight">{v}</dd>
              <dd className="text-xs text-muted">{note}</dd>
            </div>
          </Fragment>
        ))}
      </dl>
    </Card>
  )
}
