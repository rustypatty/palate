import type { Wine, WineStyle } from '../types';
import type { TasteProfile } from './taste';

/**
 * "Snap a shelf": photos of a store shelf, read and ranked by Claude against your own
 * ratings, with a price call on each bottle. The photos are only read, never kept.
 */

export type ShelfVerdict = 'top' | 'good' | 'pass';
export type PriceCall = 'bargain' | 'fair' | 'pricey' | 'unknown';

export interface ShelfBottle {
  producer: string;
  wine: string;
  vintage: string;
  region: string;
  country: string;
  grapes: string[];
  style: WineStyle | 'unknown';
  /** From the shelf tag; 0 when it couldn't be read. */
  price_usd: number;
  verdict: ShelfVerdict;
  /** 1 = best match for you. */
  rank: number;
  taste: string;
  why: string;
  price_call: PriceCall;
  price_note: string;
  tip: string;
}

export interface ShelfReport {
  summary: string;
  bottles: ShelfBottle[];
  comparisons: string[];
  buy_three: { picks: string[]; lesson: string };
  unreadable: string;
}

export interface ShelfPriceCheck {
  /** Index into report.bottles. */
  index: number;
  price_call: PriceCall;
  note: string;
  sources: string[];
}

export interface SavedShelf {
  at: number;
  store: string;
  photos: number;
  report: ShelfReport;
  pricesChecked?: number;
  /** What you did with each bottle here, by title. */
  done?: Record<string, 'want' | 'bought' | 'passed'>;
}

export type ShelfOutcome = { ok: true; report: ShelfReport } | { ok: false; reason: string };
export type PriceCheckOutcome = { ok: true; checks: ShelfPriceCheck[] } | { ok: false; reason: string };

/** Rough cost shown on the button: about 1¢ a photo plus the answer itself. */
export function shelfCost(photos: number): string {
  const cents = Math.round(12 + 1.2 * Math.max(1, photos));
  return `~${cents}¢`;
}
export const PRICE_CHECK_COST = '~30¢';
export const MAX_SHELF_PHOTOS = 10;

const KEY = 'palate.shelf';

export function loadShelf(): SavedShelf | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedShelf) : null;
  } catch {
    return null;
  }
}

export function saveShelf(s: SavedShelf | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: kept for this visit only */
  }
}

/** "Renato Ratti Barolo Marcenasco 2021" */
export function shelfTitle(b: Pick<ShelfBottle, 'producer' | 'wine' | 'vintage'>): string {
  return [b.producer, b.wine, b.vintage].filter(Boolean).join(' ');
}

const RATING_WORD = { loved: 'Loved', liked: 'Liked', wouldnt: 'Would not buy again' } as const;

/** What Claude needs to know about you: your taste in words, and your rated wines with your notes. */
export function shelfContext(wines: Wine[], taste: TasteProfile | undefined): string {
  const rated = wines
    .filter((w) => w.rating)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 40);
  const lines = rated.map((w) => {
    const name = [w.producer, w.name, w.vintage ?? ''].filter(Boolean).join(' ');
    const facts = [w.region, w.country, w.grapes.join('/'), w.price !== null ? `$${w.price}` : ''].filter(Boolean).join(', ');
    const notes = w.notes.trim().replace(/\s+/g, ' ').slice(0, 220);
    return `- ${RATING_WORD[w.rating!]}: ${name}${facts ? ` (${facts})` : ''}${notes ? ` — my notes: "${notes}"` : ''}`;
  });
  return [
    taste?.summary.length ? `My taste, worked out from my ratings: ${taste.summary.join(' ')}` : '',
    lines.length ? `Wines I've rated, newest first:\n${lines.join('\n')}` : 'I have not rated many wines yet.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// The Anthropic SDK is loaded on first use so it doesn't slow down opening the app.
export async function readShelf(photos: Blob[], context: string, store: string, signal?: AbortSignal): Promise<ShelfOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./shelfClient')).readShelfWithClaude(apiKey, photos, context, store, signal);
}

export async function checkShelfPrices(report: ShelfReport, indexes: number[], signal?: AbortSignal): Promise<PriceCheckOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./shelfClient')).checkPricesWithClaude(apiKey, report, indexes, signal);
}
