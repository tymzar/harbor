import { useSyncExternalStore } from 'react'
import type { CardId } from '../cssnet/contract'

/**
 * The product's content: what each card shows. Static sample data, with times laid out
 * relative to the current clock so the day reads as today (meetings ahead, mail just in).
 */

export const USER = { name: 'Jordan Avery', first: 'Jordan', email: 'jordan@example.com', initials: 'JA' }
export const PRODUCT = { name: 'Harbor', tagline: 'Your day, arranged' }

// One shared minute clock, so every card that shows a time updates together.
let now = Date.now()
const listeners = new Set<() => void>()
setInterval(() => { now = Date.now(); listeners.forEach((l) => l()) }, 30_000)
export function useNow(): number {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => now)
}

const MIN = 60_000
const HOUR = 60 * MIN

export const greeting = (t: number) => {
  const h = new Date(t).getHours()
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
export const longDate = (t: number) => new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(t)
export const clock = (t: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(t)
export function ago(t: number, at: number): string {
  const d = Math.max(0, t - at)
  if (d < MIN) return 'just now'
  if (d < HOUR) return `${Math.round(d / MIN)} min ago`
  if (d < 24 * HOUR) return `${Math.round(d / HOUR)} h ago`
  const days = Math.round(d / (24 * HOUR))
  return days === 1 ? 'yesterday' : `${days} days ago`
}
export function until(t: number, at: number): string {
  const d = at - t
  if (d <= 0) return 'now'
  if (d < HOUR) return `in ${Math.max(1, Math.round(d / MIN))} min`
  return `in ${Math.floor(d / HOUR)} h ${Math.round((d % HOUR) / MIN)} min`
}

/** Today's agenda: the next meetings start on the coming half hours, so there is always something ahead. */
export function agenda(t: number) {
  const base = Math.ceil(t / (30 * MIN)) * 30 * MIN
  return [
    { title: 'Design review', with: 'Product team', at: base, mins: 30 },
    { title: '1:1 with Priya', with: 'Priya Natarajan', at: base + 90 * MIN, mins: 30 },
    { title: 'Focus: offsite agenda', with: 'Blocked', at: base + 150 * MIN, mins: 90 },
  ]
}

export const BRIEFING = [
  { text: 'Q4 roadmap review moved to Thursday', tag: 'Work' },
  { text: 'Design tokens v4 landed in main', tag: 'Team' },
  { text: 'Two invoices were paid overnight', tag: 'Finance' },
  { text: 'Rain expected after 4 pm', tag: 'Weather' },
]

export const DRAFTS = [
  { title: 'Offsite agenda', words: 640, edited: 12 * MIN },
  { title: 'Hiring plan for Q1', words: 1210, edited: 26 * HOUR },
  { title: 'Reply to Lena about the venue', words: 180, edited: 50 * HOUR },
]

export const TEAM = [
  { who: 'Priya Natarajan', initials: 'PN', did: 'shipped the new onboarding flow', hue: 250 },
  { who: 'Marco Bellini', initials: 'MB', did: 'merged 14 pull requests', hue: 30 },
  { who: 'Kenji Mori', initials: 'KM', did: 'closed 9 support issues', hue: 160 },
]

export const INBOX = [
  { from: 'Lena Fischer', initials: 'LF', subject: 'Venue options for March', at: 8 * MIN, unread: true, hue: 330 },
  { from: 'GitHub', initials: 'GH', subject: 'Your release v2.4 is ready', at: 47 * MIN, unread: true, hue: 220 },
  { from: 'Sam Ortiz', initials: 'SO', subject: 'Re: budget for the trip', at: 3 * HOUR, unread: false, hue: 90 },
]
export const UNREAD = 4

export const NOTES = [
  { text: 'Book the train to Porto', done: true },
  { text: 'Renew passport photo', done: false },
  { text: 'Pick up developed film', done: false },
]

export const READING = [
  { title: 'The quiet power of good defaults', source: 'Essay', mins: 8 },
  { title: 'How tide tables are made', source: 'Science', mins: 12 },
  { title: 'A field guide to brutalist Lisbon', source: 'Travel', mins: 6 },
]

export const ARCHIVE = [
  { title: '2024 trips', count: 186 },
  { title: 'Old projects', count: 94 },
  { title: 'Receipts', count: 32 },
]

const SEASONS = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter']
const SEASON_RECIPES: Record<string, string[]> = {
  Winter: ['Citrus and fennel salad', 'Slow-braised short ribs', 'Leek and potato soup'],
  Spring: ['Asparagus with brown butter', 'Pea and mint risotto', 'Rhubarb crumble'],
  Summer: ['Tomato and peach panzanella', 'Grilled corn with lime', 'Cherry clafoutis'],
  Autumn: ['Roasted squash soup', 'Mushroom and thyme risotto', 'Apple tarte tatin'],
}
export const season = (t: number) => SEASONS[new Date(t).getMonth()]
export const recipesFor = (t: number) => SEASON_RECIPES[season(t)]

/** Explore and Library cards with a photo: where it is and how much is in it. */
export const PLACE: Partial<Record<CardId, { where: string; meta: string }>> = {
  basalt: { where: "Giant's Causeway, Northern Ireland", meta: '24 photos' },
  nightsky: { where: 'Yosemite, California', meta: '1 min timelapse' },
  moss: { where: 'Sanzen-in, Kyoto', meta: '18 photos' },
  citywalks: { where: 'Old quarters', meta: '6 routes' },
  tidepools: { where: 'Fuerteventura, Spain', meta: '15 photos' },
  desert: { where: 'Maspalomas, Gran Canaria', meta: '31 photos' },
  fieldnotes: { where: 'Spring trip', meta: '14 sketches' },
}

/** Notifications in the top bar. */
export const NOTIFICATIONS = [
  { text: 'Lena Fischer sent you venue options', at: 8 * MIN, card: 'inbox' as CardId },
  { text: 'Priya shipped the new onboarding flow', at: 2 * HOUR, card: 'team' as CardId },
  { text: 'Design review starts soon', at: 0, card: 'calendar' as CardId },
]
