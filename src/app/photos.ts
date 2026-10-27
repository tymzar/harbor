import type { CardId } from '../cssnet/contract'

/**
 * Card photos, hotlinked from Unsplash (Unsplash License: free to use, attribution appreciated).
 * Each ID was checked against its photo page and the URL against a 200 image/jpeg response.
 */
const u = (id: string) => `https://images.unsplash.com/photo-${id}?w=800&q=70&auto=format&fit=crop`

export const PHOTOS: Partial<Record<CardId, string>> = {
  basalt: u('1499011265673-5cd564976d67'),
  nightsky: u('1750801321932-3d3e3fcdfdcd'),
  moss: u('1508384429315-7cf06f2792bb'),
  citywalks: u('1741359994723-9bf66f4ae1ec'),
  tidepools: u('1767778233931-aa08c3ea91be'),
  desert: u('1760721459142-28281c948866'),
  fieldnotes: u('1758521232721-da2be69f0b64'),
  recipes: u('1591189863430-ab87e120f312'),
}

export const PHOTO_CREDIT: Partial<Record<CardId, string>> = {
  basalt: 'Eléonore Bommart', nightsky: 'Venti Views', moss: 'Jordy Meow', citywalks: 'Ronan Furuta',
  tidepools: 'Krzysztof', desert: 'Philipp', fieldnotes: 'Vitaly Gariev', recipes: 'Gareth Hubbard',
}
