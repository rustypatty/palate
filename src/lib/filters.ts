import type { Rating, Wine, WineStyle } from '../types';
import { PRICE_BANDS, STYLE_LABEL } from './constants';
import { fold, tokens } from './text';

export type Shelf = 'all' | Rating | 'owned' | 'untasted';

export type SortKey = 'recent' | 'rating' | 'price-asc' | 'price-desc' | 'vintage' | 'producer';

export interface Filters {
  query: string;
  shelf: Shelf;
  countries: string[];
  styles: WineStyle[];
  priceBands: string[];
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  query: '',
  shelf: 'all',
  countries: [],
  styles: [],
  priceBands: [],
  sort: 'recent',
};

export function searchableText(w: Wine): string {
  return fold(
    [
      w.producer,
      w.name,
      w.vintage ?? '',
      w.country,
      w.region,
      w.grapes.join(' '),
      w.style ? STYLE_LABEL[w.style] : '',
      w.store,
      w.notes,
      w.about?.text ?? '',
      w.barcode,
    ].join(' '),
  );
}

/** Every query word must appear somewhere in the wine (prefix match per word). */
export function matchesQuery(w: Wine, query: string): boolean {
  const q = tokens(query);
  if (q.length === 0) return true;
  const hay = tokens(searchableText(w));
  return q.every((t) => hay.some((h) => h.startsWith(t)));
}

function inShelf(w: Wine, shelf: Shelf): boolean {
  switch (shelf) {
    case 'all':
      return true;
    case 'owned':
      return w.owned > 0;
    case 'untasted':
      return w.rating === null;
    default:
      return w.rating === shelf;
  }
}

function inPriceBands(w: Wine, ids: string[]): boolean {
  if (ids.length === 0) return true;
  if (w.price === null) return false;
  return PRICE_BANDS.some((b) => ids.includes(b.id) && w.price! >= b.min && w.price! < b.max);
}

const yearOf = (w: Wine) => (typeof w.vintage === 'number' ? w.vintage : null);

const RATING_ORDER: Record<string, number> = { loved: 0, liked: 1, wouldnt: 2, null: 3 };

export function applyFilters(wines: Wine[], f: Filters): Wine[] {
  const countries = new Set(f.countries.map(fold));
  const out = wines.filter(
    (w) =>
      inShelf(w, f.shelf) &&
      (countries.size === 0 || countries.has(fold(w.country))) &&
      (f.styles.length === 0 || (w.style !== null && f.styles.includes(w.style))) &&
      inPriceBands(w, f.priceBands) &&
      matchesQuery(w, f.query),
  );
  const byRecent = (a: Wine, b: Wine) => b.updatedAt - a.updatedAt;
  const nullsLast = (a: number | null, b: number | null, dir: 1 | -1) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return (a - b) * dir;
  };
  const cmp: Record<SortKey, (a: Wine, b: Wine) => number> = {
    recent: byRecent,
    rating: (a, b) =>
      RATING_ORDER[String(a.rating)] - RATING_ORDER[String(b.rating)] || byRecent(a, b),
    'price-asc': (a, b) => nullsLast(a.price, b.price, 1) || byRecent(a, b),
    'price-desc': (a, b) => nullsLast(a.price, b.price, -1) || byRecent(a, b),
    vintage: (a, b) => nullsLast(yearOf(a), yearOf(b), -1) || byRecent(a, b),
    producer: (a, b) =>
      fold(a.producer).localeCompare(fold(b.producer)) || fold(a.name).localeCompare(fold(b.name)),
  };
  return out.sort(cmp[f.sort]);
}

export function activeFilterCount(f: Filters): number {
  return f.countries.length + f.styles.length + f.priceBands.length;
}

/** Distinct values with counts, most common first — for filter chips and suggestions. */
export function tally(values: string[]): { value: string; count: number }[] {
  const m = new Map<string, { value: string; count: number }>();
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const k = fold(t);
    const e = m.get(k);
    if (e) e.count++;
    else m.set(k, { value: t, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
