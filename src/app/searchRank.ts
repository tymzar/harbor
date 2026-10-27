import { CARDS, CARD_IDS, type CardId, type Category } from '../cssnet/contract'
import type { Orders } from '../model/types'
import { CARD_INFO, CATEGORY_INFO } from './catalog'

export interface SearchResult { id: CardId; category: Category; text: number; model: number; score: number }

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, ' ')

/** Text match in [0,1]: every query word must hit the title, description or category. */
export function textMatch(id: CardId, query: string): number {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  const title = norm(CARD_INFO[id].title), desc = norm(CARD_INFO[id].desc)
  const cat = norm(CATEGORY_INFO[CARDS[CARD_IDS.indexOf(id)].category as Category].title)
  let total = 0
  for (const w of words) {
    const titleWords = title.split(/\s+/)
    const s = titleWords.some((t) => t.startsWith(w)) ? 1 : title.includes(w) ? 0.75 : desc.split(/\s+/).some((t) => t.startsWith(w)) ? 0.5 : cat.startsWith(w) ? 0.35 : 0
    if (!s) return 0
    total += s
  }
  return total / words.length
}

/**
 * Rank search results with the model: text relevance first, then how much you use the card
 * (its shown score relative to your most-used card) and how high its category sits in your
 * sidebar. Of two equally good matches, the one you use more comes first.
 */
export function rankResults(query: string, scores: ArrayLike<number>, navOrder: readonly Category[], limit = 8): SearchResult[] {
  // Relative to your most-used card overall: an untouched category's cards stay low.
  let max = 1e-9
  for (let i = 0; i < CARDS.length; i++) max = Math.max(max, scores[i] ?? 0)
  const out: SearchResult[] = []
  CARDS.forEach((k, i) => {
    const text = textMatch(k.id, query)
    if (!text) return
    const model = (scores[i] ?? 0) / max
    const nav = (navOrder.length - navOrder.indexOf(k.category)) / navOrder.length
    out.push({ id: k.id, category: k.category, text, model, score: 0.6 * text + 0.3 * model + 0.1 * nav })
  })
  return out.sort((a, b) => b.score - a.score || CARD_IDS.indexOf(a.id) - CARD_IDS.indexOf(b.id)).slice(0, limit)
}

/** Empty query: "For you" = each category in sidebar order, its top cards in learned order. */
export function forYou(orders: Orders, navOrder: readonly Category[], perCategory = 3): { category: Category; ids: CardId[] }[] {
  return navOrder.map((c) => ({ category: c, ids: orders[c].slice(0, perCategory) }))
}
