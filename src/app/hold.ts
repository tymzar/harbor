import { useCallback, useReducer, useRef, type PointerEvent } from 'react'

/**
 * Never move what is under the pointer. While a mouse or pen is over a reorderable list, the list
 * keeps the order it had when the pointer came in; the latest order is applied when it leaves.
 *
 * Measured in a real browser before this: a click re-sorted the grid immediately, the next click
 * in the same spot landed on the card that had slid into place, and that wrong card became #1.
 * Touch and keyboard are not held: a tap's pointer leaves right after it lifts, and there is
 * no cursor to aim with.
 */
export function useHeldOrder<T>(order: readonly T[]) {
  const held = useRef<readonly T[] | null>(null)
  const latest = useRef(order)
  latest.current = order
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const onPointerEnter = useCallback((e: PointerEvent) => {
    if (e.pointerType !== 'touch') held.current = latest.current
  }, [])
  const onPointerLeave = useCallback(() => {
    const was = held.current
    held.current = null
    if (was && !sameOrder(was, latest.current)) rerender()
  }, [])
  const shown = held.current ?? order
  return { shown, pending: shown !== order && !sameOrder(shown, order), onPointerEnter, onPointerLeave }
}

export function sameOrder<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}
