import type { Wine, Wish } from '../types';

/**
 * Imported wishlists on Want to try: each list shown as its own group, your priorities first,
 * then by tier (most approachable first), then by price.
 */

const TIERS = ['Benchmark', 'Prestige', 'Icon', 'White Icon', 'Legend', 'Trophy'];
const tierRank = (t: string) => (TIERS.indexOf(t) + 1 || TIERS.length + 1);

export function wishOrder(a: Wish, b: Wish): number {
  if (a.priority !== null || b.priority !== null) {
    if (a.priority === null) return 1;
    if (b.priority === null) return -1;
    if (a.priority !== b.priority) return a.priority - b.priority;
  }
  return tierRank(a.tier) - tierRank(b.tier) || a.priceMin - b.priceMin;
}

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

/** "$35–50", "$1,000–2,500+", "$50,000+". */
export function wishPrice(w: Wish): string {
  if (w.priceMax === null || w.priceMax <= w.priceMin) return `${usd(w.priceMin)}${w.openEnded ? '+' : ''}`;
  return `${usd(w.priceMin)}–${w.priceMax.toLocaleString('en-US')}${w.openEnded ? '+' : ''}`;
}

/** Want to try bottles from imported lists, by list, in order. */
export function wishGroups(want: Wine[]): [string, Wine[]][] {
  const out = new Map<string, Wine[]>();
  for (const w of want) if (w.wish) out.set(w.wish.collection, [...(out.get(w.wish.collection) ?? []), w]);
  return [...out].map(([name, wines]) => [name, wines.sort((a, b) => wishOrder(a.wish!, b.wish!))]);
}
