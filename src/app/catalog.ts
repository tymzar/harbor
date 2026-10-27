import type { CardId, Category } from '../cssnet/contract'

export const CATEGORY_INFO: Record<Category, { title: string; lede: string }> = {
  home: { title: 'Home', lede: 'Your day at a glance.' },
  explore: { title: 'Explore', lede: 'Places and things worth a look.' },
  library: { title: 'Library', lede: 'Everything you have kept.' },
}

export const CARD_INFO: Record<CardId, { title: string; desc: string }> = {
  briefing: { title: 'Morning Briefing', desc: 'Five things that changed overnight' },
  drafts: { title: 'Saved Drafts', desc: 'Three drafts waiting for a final pass' },
  team: { title: 'Team Updates', desc: 'What your team shipped this week' },
  calendar: { title: 'Calendar', desc: 'Two meetings before noon' },
  inbox: { title: 'Inbox', desc: 'Messages that need a reply' },
  notes: { title: 'Notes', desc: 'Quick thoughts and lists' },
  basalt: { title: 'Basalt Coastlines', desc: 'Columns of stone along the sea' },
  nightsky: { title: 'Night-Sky Timelapse', desc: 'Six hours of stars in a minute' },
  moss: { title: 'Moss Gardens', desc: 'Kyoto temples in the rain' },
  citywalks: { title: 'City Walks', desc: 'Routes through old quarters' },
  tidepools: { title: 'Tide Pools', desc: 'Life between the tides' },
  desert: { title: 'Desert Light', desc: 'Dunes at first and last light' },
  fieldnotes: { title: 'Field Notes, Vol. 2', desc: 'Sketches from the spring trip' },
  typography: { title: 'Typography Specimens', desc: 'Type families you saved' },
  recipes: { title: 'Recipe Index', desc: 'Forty recipes, sorted by season' },
  reading: { title: 'Reading List', desc: 'Articles saved for later' },
  maps: { title: 'Saved Maps', desc: 'Places pinned on past trips' },
  archive: { title: 'Archive', desc: 'Older items, out of the way' },
}

export const NAV_ACTION: Record<Category, 'nav-home' | 'nav-explore' | 'nav-library'> = {
  home: 'nav-home', explore: 'nav-explore', library: 'nav-library',
}
