import type { ReactNode } from 'react'
import type { Person } from './types'

/**
 * Message text: *bold*, _italic_, `code`, @person mentions, #channel links, https:// links.
 * Rendered as React nodes (never as HTML), so message text cannot inject markup.
 */
const TOKEN = /(`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_|@[a-z][a-z0-9-]*|#[a-z][a-z0-9-]*|https?:\/\/[^\s)]+)/g

export function MessageText({ text, people, onChannel }: { text: string; people: Record<string, Person>; onChannel?: (id: string) => void }) {
  const out: ReactNode[] = []
  text.split('\n').forEach((line, li) => {
    if (li > 0) out.push(<br key={`br${li}`} />)
    let last = 0
    for (const m of line.matchAll(TOKEN)) {
      const tok = m[0], at = m.index ?? 0
      if (at > last) out.push(line.slice(last, at))
      const key = `${li}-${at}`
      if (tok.startsWith('`')) out.push(<code key={key} className="rounded-md bg-surface-secondary px-1 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>)
      else if (tok.startsWith('*')) out.push(<strong key={key} className="font-semibold">{tok.slice(1, -1)}</strong>)
      else if (tok.startsWith('_')) out.push(<em key={key}>{tok.slice(1, -1)}</em>)
      else if (tok.startsWith('@')) {
        const p = people[tok.slice(1)]
        out.push(p
          ? <span key={key} className={`rounded px-0.5 font-medium ${p.id === 'me' ? 'bg-warning-soft text-warning-soft-foreground' : 'bg-accent-soft text-accent-soft-foreground'}`}>@{p.name.split(' ')[0]}</span>
          : tok)
      } else if (tok.startsWith('#')) {
        const id = tok.slice(1)
        out.push(onChannel
          ? <button key={key} type="button" className="font-medium text-accent hover:underline" onClick={() => onChannel(id)}>#{id}</button>
          : <span key={key} className="font-medium text-accent">#{id}</span>)
      } else out.push(<a key={key} href={tok} target="_blank" rel="noreferrer noopener" className="text-accent underline-offset-2 hover:underline">{tok.replace(/^https?:\/\//, '')}</a>)
      last = at + tok.length
    }
    if (last < line.length) out.push(line.slice(last))
  })
  return <>{out}</>
}

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
export const clockTime = (t: number) => time.format(t)

export function dayLabel(t: number, now = Date.now()): string {
  const d = new Date(t), n = new Date(now)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(n) - start(d)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(t)
}

export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, now - t) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86_400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}
