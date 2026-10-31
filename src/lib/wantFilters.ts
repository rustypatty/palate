import type { Wine } from '../types';

/**
 * Filters at the top of Want to try: country, price and colour. A bottle's price is the one you
 * saved, or the low end of an imported wishlist's range. A bottle without a price only shows
 * when no price is chosen.
 */

export type PriceBand = 'any' | 'u50' | '50-100' | '100-200' | '200+';
export type Colour = 'any' | 'red' | 'white' | 'other';

export interface WantFilters {
  country: string;
  price: PriceBand;
  colour: Colour;
}

export const NO_FILTERS: WantFilters = { country: 'all', price: 'any', colour: 'any' };

export const PRICE_BANDS: { value: PriceBand; label: string }[] = [
  { value: 'any', label: 'Any price' },
  { value: 'u50', label: 'Under $50' },
  { value: '50-100', label: '$50–100' },
  { value: '100-200', label: '$100–200' },
  { value: '200+', label: '$200+' },
];

export const COLOURS: { value: Colour; label: string }[] = [
  { value: 'any', label: 'Any colour' },
  { value: 'red', label: 'Red' },
  { value: 'white', label: 'White' },
  { value: 'other', label: 'Other' },
];

export const priceOf = (w: Wine): number | null => (w.wish ? w.wish.priceMin : w.price);

function inBand(price: number | null, band: PriceBand): boolean {
  if (band === 'any') return true;
  if (price === null) return false;
  if (band === 'u50') return price < 50;
  if (band === '50-100') return price >= 50 && price < 100;
  if (band === '100-200') return price >= 100 && price < 200;
  return price >= 200;
}

const colourOf = (w: Wine): Colour => (w.style === 'red' || w.style === 'white' ? w.style : 'other');

export function filterWant(wines: Wine[], f: WantFilters): Wine[] {
  return wines.filter(
    (w) => (f.country === 'all' || (w.country || 'Unknown') === f.country) && inBand(priceOf(w), f.price) && (f.colour === 'any' || colourOf(w) === f.colour),
  );
}

/** The countries on the list, most bottles first. */
export function wantCountries(wines: Wine[]): string[] {
  const n = new Map<string, number>();
  for (const w of wines) n.set(w.country || 'Unknown', (n.get(w.country || 'Unknown') ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}
