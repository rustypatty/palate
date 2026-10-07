import { emptyDraft } from '../db';
import type { WineDraft, WineStyle } from '../types';

/**
 * "Snap a wine list": photos of a restaurant's list, read once into a clean list, then a
 * conversation about it ("Any Pinot?", "Best value under $100"). Follow-up questions send the
 * list as text, not the photos again, so they cost a few cents. The photos are never kept.
 */

export interface ListWine {
  /** The list's own heading, e.g. "Burgundy" or "Rest of the world". */
  section: string;
  producer: string;
  wine: string;
  vintage: string;
  region: string;
  country: string;
  grapes: string[];
  style: WineStyle | 'unknown';
  /** Bottle price; 0 when there isn't one. */
  price: number;
  /** By-the-glass price; 0 when there isn't one. */
  glass_price: number;
}

export interface ListPick {
  /** Number of the wine in the list (1-based). */
  n: number;
  why: string;
  tag: 'match' | 'value' | 'new' | '';
}

export interface ListAnswer {
  reply: string;
  picks: ListPick[];
  /** A short lesson to remember, or empty. */
  tip: string;
}

export interface ListTurn {
  q: string;
  a: ListAnswer | null;
  error?: string;
}

export interface SavedList {
  at: number;
  pages: number;
  wines: ListWine[];
  unreadable: string;
  turns: ListTurn[];
  /** What you did with a wine on the list, by its number. */
  done?: Record<number, 'want' | 'ordered'>;
}

export type ReadListOutcome = { ok: true; wines: ListWine[]; unreadable: string } | { ok: false; reason: string };
export type AskOutcome = { ok: true; answer: ListAnswer } | { ok: false; reason: string };

export const MAX_LIST_PAGES = 10;

export const QUICK_QUESTIONS = ['Best for me', 'Best value under $100', 'Something new to try', 'By the glass'];

const KEY = 'palate.wineList';

export function loadList(): SavedList | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedList) : null;
  } catch {
    return null;
  }
}

export function saveList(s: SavedList | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: kept for this visit only */
  }
}

/** "Domaine Faiveley Nuits-Saint-Georges Les Montroziers 2022" */
export function listWineTitle(w: Pick<ListWine, 'producer' | 'wine' | 'vintage'>): string {
  return [w.producer, w.wine, w.vintage].filter(Boolean).join(' ');
}

/** The list as numbered lines, grouped by section, for Claude to answer from. */
export function listAsText(wines: ListWine[]): string {
  let section = '';
  const lines: string[] = [];
  wines.forEach((w, i) => {
    if (w.section !== section) {
      section = w.section;
      lines.push(`\n## ${section || 'Wines'}`);
    }
    const facts = [w.region, w.country, w.grapes.join('/'), w.style !== 'unknown' ? w.style : ''].filter(Boolean).join(', ');
    const prices = [w.price > 0 ? `$${w.price} bottle` : '', w.glass_price > 0 ? `$${w.glass_price} glass` : ''].filter(Boolean).join(', ');
    lines.push(`${i + 1}. ${listWineTitle(w)}${facts ? ` (${facts})` : ''}${prices ? ` — ${prices}` : ''}`);
  });
  return lines.join('\n').trim();
}

/** A wine from the list as a collection entry (on Want to try, or ordered tonight and ready to rate). */
export function draftFromListWine(w: ListWine, why: string, n: number, at: number): WineDraft {
  return {
    ...emptyDraft(),
    producer: w.producer,
    name: w.wine,
    vintage: /^\d{4}$/.test(w.vintage) ? Number(w.vintage) : w.vintage === 'NV' ? 'NV' : null,
    country: w.country,
    region: w.region,
    grapes: w.grapes,
    style: w.style === 'unknown' ? null : w.style,
    // A restaurant price isn't what the bottle costs in a shop, so it isn't kept as the price.
    price: null,
    store: 'Restaurant',
    suggestion: { reason: why, source: 'Restaurant wine list', url: '', key: `list:${at}:${n}`, at: Date.now() },
  };
}

// The Anthropic SDK is loaded on first use so it doesn't slow down opening the app.
export async function readWineList(photos: Blob[], signal?: AbortSignal): Promise<ReadListOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./wineListClient')).readWineListWithClaude(apiKey, photos, signal);
}

export async function askWineList(list: SavedList, question: string, context: string, signal?: AbortSignal): Promise<AskOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./wineListClient')).askWineListWithClaude(apiKey, list, question, context, signal);
}
