/** Cove: a team chat workspace. Data types shared by the seed content, the store and the UI. */

export type AvatarColor = 'accent' | 'success' | 'warning' | 'danger' | 'default'

export interface Person {
  id: string
  name: string
  /** Role shown in profiles, e.g. "Design lead". */
  title: string
  initials: string
  color: AvatarColor
  presence: 'active' | 'away'
  /** Optional status text, e.g. "In a meeting until 3". */
  status?: string
}

export interface Reaction {
  emoji: string
  /** Person ids; 'me' is the signed-in user. */
  by: string[]
}

export interface Message {
  id: string
  /** Channel id (DMs use 'dm-<personId>'). */
  channel: string
  /** Person id, or 'me'. */
  author: string
  /**
   * Text with a small markdown subset: *bold*, _italic_, `code`, @personId mentions
   * (e.g. "@priya"), #channel links, and plain https:// links.
   */
  text: string
  /** Milliseconds relative to "now" when the app starts (negative = in the past). */
  at: number
  reactions?: Reaction[]
  /** Thread replies (same shape; their channel is the parent's). */
  replies?: Message[]
  pinned?: boolean
}

export interface Channel {
  /** Short id without '#', e.g. 'design'. DMs: 'dm-<personId>'. */
  id: string
  /** Display name: channel name without '#', or the person's name for DMs. */
  name: string
  topic: string
  /** Person ids (not including 'me'; 'me' is in every channel). */
  members: string[]
  kind: 'channel' | 'dm'
  private?: boolean
}

/** A message that arrives while the app is open (simulated colleagues). */
export interface Incoming {
  /** Seconds after the app starts. */
  afterSec: number
  message: Omit<Message, 'at'>
}
