import { describe, expect, it } from 'vitest'
import { CARD_IDS, CATEGORIES } from '../cssnet/contract'
import { defaultOrders } from './adaptive'
import { forYou, rankResults, textMatch } from './searchRank'

describe('search ranking', () => {
  it('matches word prefixes in title, then description, then category; every word must match', () => {
    expect(textMatch('drafts', 'saved dr')).toBe(1)
    expect(textMatch('drafts', 'final')).toBeCloseTo(0.5) // description word
    expect(textMatch('drafts', 'zebra')).toBe(0)
    expect(textMatch('drafts', 'saved zebra')).toBe(0)
  })
  it('the model breaks ties: of two equal text matches, the one you use more comes first', () => {
    const flat = CARD_IDS.map(() => 1 / 6)
    const base = rankResults('s', flat, [...CATEGORIES], 20).map((r) => r.id)
    const used = CARD_IDS.map((id) => (id === 'maps' ? 0.6 : 0.08))
    const ranked = rankResults('s', used, [...CATEGORIES], 20).map((r) => r.id)
    expect(base.indexOf('maps')).toBeGreaterThan(ranked.indexOf('maps'))
    expect(ranked[0]).toBe('maps')
  })
  it('empty query lists each category in sidebar order with its learned top cards', () => {
    const s = forYou(defaultOrders(), ['library', 'home', 'explore'])
    expect(s.map((x) => x.category)).toEqual(['library', 'home', 'explore'])
    expect(s[0].ids).toHaveLength(3)
  })
})
