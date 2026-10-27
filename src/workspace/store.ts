import { del, get, set } from 'idb-keyval'
import { CHANNELS, INCOMING, MESSAGES, ME, PEOPLE } from './seed'
import type { Channel, Message, Person, Reaction } from './types'

/**
 * Chat state: seed conversations (times relative to app start), what you did (sent messages,
 * reactions, saved, starred, read state, kept in IndexedDB), and colleagues who post while the
 * app is open (INCOMING; each arrives once, then it is kept like any other message).
 */

const STATE_KEY = 'cove/state-v1'
const UNREAD_WINDOW = 3 * 60 * 60_000 // seed messages from the last 3 hours start unread

interface Persisted {
  version: 1
  /** Your messages and thread replies (absolute times). parent = thread parent id. */
  sent: (Message & { parent?: string })[]
  /** Messages that arrived during earlier sessions (absolute times). */
  received: Message[]
  /** Reaction toggles by you: messageId -> emoji -> on/off (overrides the seed). */
  reactions: Record<string, Record<string, boolean>>
  saved: string[]
  starred: string[]
  lastRead: Record<string, number>
}

export interface ChatState {
  ready: boolean
  people: Record<string, Person>
  channels: Channel[]
  messages: Record<string, Message[]>
  lastRead: Record<string, number>
  saved: string[]
  starred: string[]
  /** channel -> person id currently typing there */
  typing: Record<string, string | undefined>
  version: number
}

let uid = 0
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(uid++).toString(36)}`

export class ChatStore {
  private listeners = new Set<() => void>()
  private persisted: Persisted = { version: 1, sent: [], received: [], reactions: {}, saved: [], starred: [], lastRead: {} }
  private timers: ReturnType<typeof setTimeout>[] = []
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private readonly t0 = Date.now()
  private state: ChatState = {
    ready: false,
    people: Object.fromEntries([ME, ...PEOPLE].map((p) => [p.id, p])),
    channels: CHANNELS,
    messages: {},
    lastRead: {},
    saved: [],
    starred: [],
    typing: {},
    version: 0,
  }
  /** Called for every message a colleague posts while the app is open. */
  onIncoming: ((m: Message) => void) | null = null

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l) } }
  getState = () => this.state
  private set(patch: Partial<ChatState>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 }
    this.listeners.forEach((l) => l())
  }

  async start(): Promise<void> {
    try {
      const p = await get<Persisted>(STATE_KEY)
      if (p?.version === 1) this.persisted = p
    } catch (e) { console.warn('cove: saved chat state ignored', e) }
    const seedLastRead = Object.fromEntries(CHANNELS.map((c) => [c.id, this.t0 - UNREAD_WINDOW]))
    this.set({
      ready: true,
      messages: this.build(),
      lastRead: { ...seedLastRead, ...this.persisted.lastRead },
      saved: this.persisted.saved,
      starred: this.persisted.starred,
    })
    const done = new Set(this.persisted.received.map((m) => m.id))
    for (const inc of INCOMING) {
      if (done.has(inc.message.id)) continue
      const typeAt = Math.max(0, inc.afterSec * 1000 - 2600)
      this.timers.push(setTimeout(() => this.setTyping(inc.message.channel, inc.message.author), typeAt))
      this.timers.push(setTimeout(() => this.receive({ ...inc.message, at: Date.now() }), inc.afterSec * 1000))
    }
  }

  stop() { this.timers.forEach(clearTimeout); this.timers = [] }

  /** Seed (relative times) + earlier sessions' arrivals + your messages, with your reaction overrides. */
  private build(): Record<string, Message[]> {
    const byChannel: Record<string, Message[]> = Object.fromEntries(CHANNELS.map((c) => [c.id, []]))
    const abs = (m: Message): Message => ({ ...m, at: this.t0 + m.at, replies: m.replies?.map(abs) })
    for (const m of MESSAGES) byChannel[m.channel]?.push(abs(m))
    for (const m of this.persisted.received) byChannel[m.channel]?.push(m)
    const all = Object.values(byChannel).flat()
    for (const m of this.persisted.sent) {
      if (m.parent) {
        const parent = all.find((x) => x.id === m.parent)
        if (parent) parent.replies = [...(parent.replies ?? []), m]
      } else byChannel[m.channel]?.push(m)
    }
    for (const list of Object.values(byChannel)) {
      list.sort((a, b) => a.at - b.at)
      for (const m of list) {
        this.overrideReactions(m)
        m.replies?.sort((a, b) => a.at - b.at).forEach((r) => this.overrideReactions(r))
      }
    }
    return byChannel
  }

  private overrideReactions(m: Message) {
    const mine = this.persisted.reactions[m.id]
    if (!mine) return
    let rs: Reaction[] = (m.reactions ?? []).map((r) => ({ ...r, by: r.by.filter((p) => p !== 'me') }))
    for (const [emoji, on] of Object.entries(mine)) {
      if (!on) continue
      const r = rs.find((x) => x.emoji === emoji)
      if (r) r.by = [...r.by, 'me']
      else rs = [...rs, { emoji, by: ['me'] }]
    }
    m.reactions = rs.filter((r) => r.by.length > 0)
  }

  private setTyping(channel: string, person: string) {
    this.set({ typing: { ...this.state.typing, [channel]: person } })
  }

  private receive(m: Message) {
    const list = [...(this.state.messages[m.channel] ?? []), m]
    this.persisted.received = [...this.persisted.received, m]
    this.set({ messages: { ...this.state.messages, [m.channel]: list }, typing: { ...this.state.typing, [m.channel]: undefined } })
    this.scheduleSave()
    this.onIncoming?.(m)
  }

  find(id: string): Message | undefined {
    for (const list of Object.values(this.state.messages)) {
      for (const m of list) {
        if (m.id === id) return m
        const r = m.replies?.find((x) => x.id === id)
        if (r) return r
      }
    }
    return undefined
  }

  /** Post a message (or a thread reply when `parent` is given). */
  send(channel: string, text: string, parent?: string): Message | null {
    const body = text.trim()
    if (!body) return null
    const m: Message & { parent?: string } = { id: newId('me'), channel, author: 'me', text: body, at: Date.now(), ...(parent ? { parent } : {}) }
    this.persisted.sent = [...this.persisted.sent, m]
    const list = this.state.messages[channel] ?? []
    const next = parent
      ? list.map((x) => (x.id === parent ? { ...x, replies: [...(x.replies ?? []), m] } : x))
      : [...list, m]
    this.set({ messages: { ...this.state.messages, [channel]: next } })
    this.markRead(channel)
    this.scheduleSave()
    return m
  }

  /** Toggle your reaction on a message or reply. */
  react(messageId: string, emoji: string) {
    const target = this.find(messageId)
    if (!target) return
    const has = !!target.reactions?.find((r) => r.emoji === emoji)?.by.includes('me')
    this.persisted.reactions = { ...this.persisted.reactions, [messageId]: { ...this.persisted.reactions[messageId], [emoji]: !has } }
    const toggle = (m: Message): Message => {
      if (m.id !== messageId) return m.replies ? { ...m, replies: m.replies.map(toggle) } : m
      let rs = (m.reactions ?? []).map((r) => (r.emoji === emoji ? { ...r, by: has ? r.by.filter((p) => p !== 'me') : [...r.by, 'me'] } : r))
      if (!has && !rs.some((r) => r.emoji === emoji)) rs = [...rs, { emoji, by: ['me'] }]
      return { ...m, reactions: rs.filter((r) => r.by.length > 0) }
    }
    this.set({ messages: Object.fromEntries(Object.entries(this.state.messages).map(([c, l]) => [c, l.map(toggle)])) })
    this.scheduleSave()
  }

  toggleSaved(messageId: string) {
    const saved = this.state.saved.includes(messageId) ? this.state.saved.filter((x) => x !== messageId) : [messageId, ...this.state.saved]
    this.persisted.saved = saved
    this.set({ saved })
    this.scheduleSave()
  }

  /** Returns true when the channel is now starred. */
  toggleStar(channel: string): boolean {
    const on = !this.state.starred.includes(channel)
    const starred = on ? [...this.state.starred, channel] : this.state.starred.filter((x) => x !== channel)
    this.persisted.starred = starred
    this.set({ starred })
    this.scheduleSave()
    return on
  }

  markRead(channel: string) {
    const list = this.state.messages[channel] ?? []
    const latest = Math.max(Date.now(), ...list.map((m) => m.at))
    if ((this.state.lastRead[channel] ?? 0) >= latest) return
    const lastRead = { ...this.state.lastRead, [channel]: latest }
    this.persisted.lastRead = lastRead
    this.set({ lastRead })
    this.scheduleSave()
  }

  unread(channel: string): number {
    const since = this.state.lastRead[channel] ?? 0
    return (this.state.messages[channel] ?? []).filter((m) => m.at > since && m.author !== 'me').length
  }
  mentions(channel: string): number {
    const since = this.state.lastRead[channel] ?? 0
    const ch = this.state.channels.find((c) => c.id === channel)
    return (this.state.messages[channel] ?? []).filter((m) => m.at > since && m.author !== 'me' && (ch?.kind === 'dm' || /@me\b/.test(m.text))).length
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => { this.saveTimer = null; void set(STATE_KEY, this.persisted).catch((e) => console.warn('cove: save failed', e)) }, 600)
  }
  flush() {
    if (!this.saveTimer) return
    clearTimeout(this.saveTimer); this.saveTimer = null
    void set(STATE_KEY, this.persisted).catch(() => undefined)
  }

  async reset(): Promise<void> {
    this.stop()
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null }
    try { await del(STATE_KEY) } catch { /* storage unavailable */ }
    this.persisted = { version: 1, sent: [], received: [], reactions: {}, saved: [], starred: [], lastRead: {} }
  }
}
