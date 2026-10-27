import { useLayoutEffect, useMemo, type CSSProperties } from 'react'
import type { CssNet } from '../contract'
import { activationVars, ensureVisualStyles } from './styles'

export interface VisualProps {
  /** Hidden activations (relu outputs). Takes precedence over `net`. */
  hidden?: ArrayLike<number>
  /** Optional net to read activations from when `hidden` is not given. */
  net?: CssNet | null
  /** Ignored by the visuals but accepted so the app can pass its whole state. */
  outputs?: ArrayLike<number>
  ranking?: readonly string[]
  mode?: string
  className?: string
  style?: CSSProperties
}

function useActivations(props: VisualProps): Record<string, string> {
  const src = props.hidden ?? (props.net ? props.net.readHidden() : undefined)
  const key = src ? Array.from(src, (v) => Number(v).toPrecision(4)).join(',') : ''
  return useMemo(() => activationVars(src), [key]) // eslint-disable-line react-hooks/exhaustive-deps
}

function useStyles() {
  useLayoutEffect(() => { ensureVisualStyles(document) }, [])
}

/**
 * Generative background: a static multi-stop gradient (painted once) whose
 * filter chain (hue / saturation / contrast / brightness / blur), rotation, scale and
 * translation are driven by hidden activations. Every per-frame change is a compositor
 * property on a will-change layer; the custom properties transition for smoothness.
 */
export function PatternLayer(props: VisualProps) {
  useStyles()
  const vars = useActivations(props)
  return (
    <div data-testid="pattern-layer" className={`cn-pattern${props.className ? ` ${props.className}` : ''}`} style={{ ...vars, ...props.style } as CSSProperties} aria-hidden="true">
      <div className="cn-pattern__base" />
      <div className="cn-pattern__glow" />
      <div className="cn-pattern__grain" />
    </div>
  )
}

export interface DotGridProps extends VisualProps {
  /** Lattice size in px (default 240). */
  size?: number
  /** Perspective distance in px (default 700). */
  perspective?: number
  /** Dot colour. */
  dot?: string
}

/**
 * One painted dot lattice inside three nested transform wrappers. Each wrapper is a
 * matrix3d built from hidden activations; with the default transform-style: flat every
 * level applies its own perspective divide, so the chain is a genuine nonlinear warp.
 * Only `transform` changes per frame (compositor); the lattice is painted once.
 */
export function DotGrid(props: DotGridProps) {
  useStyles()
  const vars = useActivations(props)
  const style = {
    ...vars,
    ...(props.size ? { '--cn-size': `${props.size}px` } : {}),
    ...(props.perspective ? { '--cn-persp': `${props.perspective}px` } : {}),
    ...(props.dot ? { '--cn-dot': props.dot } : {}),
    ...props.style,
  } as CSSProperties
  return (
    <div data-testid="dot-grid" className={`cn-dotgrid${props.className ? ` ${props.className}` : ''}`} style={style} aria-hidden="true">
      <div className="cn-dotgrid__m cn-dotgrid__m1"><div className="cn-dotgrid__m cn-dotgrid__m2"><div className="cn-dotgrid__m cn-dotgrid__m3">
        <div className="cn-dotgrid__dots" />
      </div></div></div>
    </div>
  )
}
