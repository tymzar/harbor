import { startTransition, useEffect, useState } from 'react'

/**
 * Like useDeferredValue, but the lagging copy only catches up after the frame that shows the
 * new value has been produced (rAF, then a posted message), as a transition.
 *
 * Why not useDeferredValue: React starts the deferred render right after the urgent commit, in
 * a scheduler task that is already queued when the next frame's rAF runs. Measured here (dev
 * build), that task (Recharts render + its store-driven re-renders) ran 5-18 ms between the
 * frame with the new card order and the click-to-pixel probe, and on category switches it
 * delayed the frame itself. Below-the-fold panels can afford one frame of lag.
 */
export function useAfterPaint<T>(value: T): T {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    if (Object.is(shown, value)) return
    let port: MessagePort | null = null
    const raf = requestAnimationFrame(() => {
      const ch = new MessageChannel()
      port = ch.port1
      port.onmessage = () => { port?.close(); port = null; startTransition(() => setShown(value)) }
      ch.port2.postMessage(0)
    })
    return () => { cancelAnimationFrame(raf); port?.close() }
  }, [shown, value])
  return shown
}
