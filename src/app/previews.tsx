import { memo, useState, type ReactNode } from 'react'
import { Avatar, Card } from '@heroui/react'
import { CircleCheckFill, Circle, MapPin } from '@gravity-ui/icons'
import type { CardId } from '../cssnet/contract'
import { CARD_INFO } from './catalog'
import {
  ARCHIVE, BRIEFING, DRAFTS, INBOX, NOTES, PLACE, READING, TEAM, UNREAD,
  ago, agenda, clock, recipesFor, season, until, useNow,
} from './content'
import { PHOTOS, PHOTO_CREDIT } from './photos'

type AvatarColor = 'accent' | 'success' | 'warning' | 'danger' | 'default'
const AVATAR_COLOR: AvatarColor[] = ['accent', 'warning', 'success', 'default']

function Title({ id, meta }: { id: CardId; meta: ReactNode }) {
  return (
    <Card.Header className="gap-0.5">
      <Card.Title className="text-base font-medium tracking-tight">{CARD_INFO[id].title}</Card.Title>
      <Card.Description className="truncate text-sm text-muted">{meta}</Card.Description>
    </Card.Header>
  )
}

const Rows = ({ children }: { children: ReactNode }) => <ul className="flex min-h-0 flex-col gap-2.5 text-sm">{children}</ul>

/** A full-bleed photo with a quiet gradient underneath while it loads (or if it cannot). */
function Photo({ id }: { id: CardId }) {
  const [failed, setFailed] = useState(false)
  const src = PHOTOS[id]
  return (
    <div className="relative h-36 shrink-0 overflow-hidden bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_30%,var(--surface-secondary)),var(--surface-secondary))]">
      {src && !failed && (
        <img src={src} alt="" title={PHOTO_CREDIT[id] ? `Photo: ${PHOTO_CREDIT[id]} on Unsplash` : undefined} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover" />
      )}
    </div>
  )
}

function PhotoCard({ id }: { id: CardId }) {
  const p = PLACE[id]!
  return (
    <>
      <Photo id={id} />
      <div className="flex flex-col gap-1 px-5 pt-4">
        <Title id={id} meta={CARD_INFO[id].desc} />
        <p className="flex items-center gap-1.5 text-xs text-muted"><MapPin className="size-3.5" />{p.where} · {p.meta}</p>
      </div>
    </>
  )
}

function Briefing() {
  const t = useNow()
  return (
    <>
      <Title id="briefing" meta={`Updated ${clock(t - 23 * 60_000)}`} />
      <Rows>
        {BRIEFING.slice(0, 3).map((b) => (
          <li key={b.text} className="flex items-baseline gap-2">
            <span className="w-16 shrink-0 text-xs text-muted">{b.tag}</span>
            <span className="truncate">{b.text}</span>
          </li>
        ))}
      </Rows>
    </>
  )
}

function Drafts() {
  const t = useNow()
  return (
    <>
      <Title id="drafts" meta={`${DRAFTS.length} waiting for a final pass`} />
      <Rows>
        {DRAFTS.map((d) => (
          <li key={d.title} className="flex items-baseline gap-2">
            <span className="truncate">{d.title}</span>
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">{ago(t, t - d.edited)}</span>
          </li>
        ))}
      </Rows>
    </>
  )
}

function Team() {
  return (
    <>
      <Title id="team" meta="This week" />
      <Rows>
        {TEAM.map((m, i) => (
          <li key={m.who} className="flex items-center gap-2.5">
            <Avatar size="sm" variant="soft" color={AVATAR_COLOR[i]} className="size-6 shrink-0 text-[10px]"><Avatar.Fallback>{m.initials}</Avatar.Fallback></Avatar>
            <span className="truncate"><span className="font-medium">{m.who.split(' ')[0]}</span> <span className="text-muted">{m.did}</span></span>
          </li>
        ))}
      </Rows>
    </>
  )
}

function Calendar() {
  const t = useNow()
  const events = agenda(t)
  return (
    <>
      <Title id="calendar" meta={`Next: ${events[0].title} ${until(t, events[0].at)}`} />
      <ul className="flex flex-col gap-2 text-sm">
        {events.map((e, i) => (
          <li key={e.title} className="flex items-stretch gap-3">
            <span className={`w-1 shrink-0 rounded-full ${i === 0 ? 'bg-accent' : 'bg-surface-tertiary'}`} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{e.title}</span>
              <span className="text-xs tabular-nums text-muted">{clock(e.at)}–{clock(e.at + e.mins * 60_000)} · {e.with}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

function Inbox() {
  const t = useNow()
  return (
    <>
      <Title id="inbox" meta={`${UNREAD} unread`} />
      <Rows>
        {INBOX.map((m, i) => (
          <li key={m.subject} className="flex items-center gap-2.5">
            <Avatar size="sm" variant="soft" color={AVATAR_COLOR[(i + 1) % 4]} className="size-6 shrink-0 text-[10px]"><Avatar.Fallback>{m.initials}</Avatar.Fallback></Avatar>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className={`truncate ${m.unread ? 'font-medium' : ''}`}>{m.from}</span>
              <span className="truncate text-xs text-muted">{m.subject}</span>
            </span>
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">{ago(t, t - m.at)}</span>
          </li>
        ))}
      </Rows>
    </>
  )
}

function Notes() {
  return (
    <>
      <Title id="notes" meta="Packing list · 3 items" />
      <Rows>
        {NOTES.map((n) => (
          <li key={n.text} className="flex items-center gap-2">
            {n.done ? <CircleCheckFill className="size-4 shrink-0 text-accent" /> : <Circle className="size-4 shrink-0 text-muted" />}
            <span className={n.done ? 'text-muted line-through' : ''}>{n.text}</span>
          </li>
        ))}
      </Rows>
    </>
  )
}

function Typography() {
  const faces = [
    { name: 'Serif', family: 'ui-serif, Georgia, serif' },
    { name: 'Sans', family: 'ui-sans-serif, system-ui, sans-serif' },
    { name: 'Mono', family: 'ui-monospace, Menlo, monospace' },
  ]
  return (
    <>
      <Title id="typography" meta="12 families saved" />
      <div className="grid grid-cols-3 gap-2">
        {faces.map((f) => (
          <div key={f.name} className="flex flex-col items-start gap-1 rounded-xl bg-surface-secondary px-3 py-2.5">
            <span className="text-3xl leading-none" style={{ fontFamily: f.family }}>Aa</span>
            <span className="text-xs text-muted">{f.name}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function Recipes() {
  const t = useNow()
  return (
    <>
      <Title id="recipes" meta={`In season: ${season(t)}`} />
      <Rows>
        {recipesFor(t).map((r) => <li key={r} className="truncate">{r}</li>)}
      </Rows>
    </>
  )
}

function Reading() {
  return (
    <>
      <Title id="reading" meta={`${READING.length} unread · ${READING.reduce((n, r) => n + r.mins, 0)} min`} />
      <Rows>
        {READING.map((r) => (
          <li key={r.title} className="flex items-baseline gap-2">
            <span className="truncate">{r.title}</span>
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">{r.mins} min</span>
          </li>
        ))}
      </Rows>
    </>
  )
}

/** A small drawn map: coastline, a road, and the pinned places. */
function Maps() {
  const pins = [[52, 40], [98, 62], [150, 34], [196, 70]]
  return (
    <>
      <Title id="maps" meta="4 trips · 37 places" />
      <svg viewBox="0 0 240 96" className="h-24 w-full rounded-xl bg-surface-secondary" aria-hidden>
        <path d="M0 78 C40 70 60 88 100 80 S170 60 240 72 V96 H0Z" fill="color-mix(in oklab, var(--accent) 16%, transparent)" />
        <path d="M10 20 C60 30 90 10 130 40 S200 50 232 24" stroke="var(--border)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M30 88 L70 12 M160 90 L190 8" stroke="var(--border)" strokeWidth="2" fill="none" />
        {pins.map(([x, y]) => (
          <g key={x}>
            <circle cx={x} cy={y} r="6" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        ))}
      </svg>
    </>
  )
}

function Archive() {
  return (
    <>
      <Title id="archive" meta={`${ARCHIVE.reduce((n, a) => n + a.count, 0)} items`} />
      <Rows>
        {ARCHIVE.map((a) => (
          <li key={a.title} className="flex items-baseline gap-2">
            <span className="truncate">{a.title}</span>
            <span className="ml-auto text-xs tabular-nums text-muted">{a.count}</span>
          </li>
        ))}
      </Rows>
    </>
  )
}

const BODY: Partial<Record<CardId, () => ReactNode>> = {
  briefing: Briefing, drafts: Drafts, team: Team, calendar: Calendar, inbox: Inbox, notes: Notes,
  typography: Typography, recipes: Recipes, reading: Reading, maps: Maps, archive: Archive,
}

/** Everything above a card's footer: a photo and caption, or a title and a live preview of its content. */
export const CardPreview = memo(function CardPreview({ id }: { id: CardId }) {
  if (PLACE[id]) return <PhotoCard id={id} />
  const Body = BODY[id]!
  return <div className="flex min-h-0 flex-col gap-3 px-5 pt-5"><Body /></div>
})
