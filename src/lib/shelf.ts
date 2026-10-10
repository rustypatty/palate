import type { Wine, WineStyle } from '../types';
import type { TasteProfile } from './taste';
import { loadProfile, profileContext } from './profile';

/**
 * "Snap a shelf": photos of a store shelf, read and ranked by Claude against your own
 * ratings, with a price call on each bottle. The photos are only read, never kept.
 */

/** "top": one of the 3–5 best buys for you here; "good": also worth a look. Bottles to skip aren't listed. */
export type ShelfVerdict = 'top' | 'good';
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
  /** A sale or mix-6 price as printed on the tag, e.g. "$40.49 in a mix of 6"; empty if none. */
  deal: string;
  /** A critic score as printed on the tag, e.g. "95 James Suckling"; empty if none. */
  score: string;
  /** Where it is in the photos, e.g. "Photo 1, blue label". */
  where: string;
  verdict: ShelfVerdict;
  /** Short tasting tags (top picks only). */
  taste: string[];
  /** Why it suits you; one line for "also good" bottles. */
  why: string;
  price_call: PriceCall;
  /** Filled in by "Check prices online". */
  price_note?: string;
  tip: string;
  /** What Palate's wine catalog adds (free, after the read): null when it doesn't know this bottle for sure. */
  catalog?: ShelfCatalog | null;
}

export interface ShelfCatalog {
  photo: { url: string; pageUrl: string; siteName: string } | null;
  style: WineStyle | 'unknown';
  grapes: string[];
  region: string;
  country: string;
}

/** The bottle's details, the shelf reading first and the catalog filling the gaps. */
export function shelfDetails(b: ShelfBottle): { style: WineStyle | null; region: string; country: string; grapes: string[] } {
  const c = b.catalog;
  const style = b.style !== 'unknown' ? b.style : c && c.style !== 'unknown' ? c.style : null;
  return { style, region: b.region || c?.region || '', country: b.country || c?.country || '', grapes: b.grapes.length ? b.grapes : (c?.grapes ?? []) };
}

export interface ShelfReport {
  /** "If you get one: … On a budget: …" */
  decision: string;
  /** What trying the picks side by side would teach you; may be empty. */
  lesson: string;
  /** Top picks first, best first, then the "also good" ones. */
  bottles: ShelfBottle[];
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
  /** What you said you were looking for, if anything. */
  lookingFor?: string;
  report: ShelfReport;
  pricesChecked?: number;
  /** What you did with each bottle here, by title. */
  done?: Record<string, 'want' | 'bought' | 'passed'>;
}

export type ShelfOutcome = { ok: true; report: ShelfReport } | { ok: false; reason: string };
export type PriceCheckOutcome = { ok: true; checks: ShelfPriceCheck[] } | { ok: false; reason: string };

export const MAX_SHELF_PHOTOS = 10;

const KEY = 'palate.shelf';
/** How long a shelf result is kept. */
export const SHELF_TTL = 60 * 60 * 1000;

export function loadShelf(): SavedShelf | null {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as SavedShelf) : null;
    // Shelves read before the shorter answers (no decision line) are dropped rather than shown half-empty,
    // and a shelf is only kept for an hour: by then you've left the aisle.
    return saved && typeof saved.report?.decision === 'string' && Date.now() - saved.at < SHELF_TTL ? saved : null;
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
    profileContext(loadProfile()),
    taste?.summary.length ? `My taste, worked out from my ratings: ${taste.summary.join(' ')}` : '',
    lines.length ? `Wines I've rated, newest first:\n${lines.join('\n')}` : 'I have not rated many wines yet.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The most per bottle: from "Looking for" ("under $100", "$60 max"), else your profile's budget. */
export function shelfBudget(lookingFor: string, profileBudget: number | null): number | null {
  const m = /(?:under|below|less than|up to|max(?:imum)?|<|≤)\s*\$?\s*(\d{2,4})/i.exec(lookingFor) ?? /\$\s*(\d{2,4})/.exec(lookingFor);
  return m ? Number(m[1]) : profileBudget;
}

/** The first price in a tag's deal text, e.g. "$98.99 in a mix of 6" → 98.99. */
const dealPrice = (deal: string): number | null => {
  const m = /\$\s*(\d+(?:\.\d+)?)/.exec(deal);
  return m ? Number(m[1]) : null;
};

/**
 * Only bottles within budget, whatever Claude wrote: none over it and none whose price wasn't
 * read, except at most one over-budget bottle among "also good", and only if its sale or mix-6
 * price fits.
 */
export function withinBudget(bottles: ShelfBottle[], budget: number | null): ShelfBottle[] {
  if (budget === null) return bottles;
  // A price that wasn't read can't be shown to fit, so it's left out too.
  const fits = (b: ShelfBottle) => b.price_usd > 0 && b.price_usd <= budget;
  const over = (b: ShelfBottle) => b.price_usd > budget;
  const top = bottles.filter((b) => b.verdict === 'top' && fits(b));
  const good = bottles.filter((b) => b.verdict === 'good' && fits(b));
  const stretch = bottles.find((b) => over(b) && (dealPrice(b.deal) ?? Infinity) <= budget);
  return [...top, ...good, ...(stretch ? [{ ...stretch, verdict: 'good' as const }] : [])];
}

/** The top 3 stay on top; any further picks join "Also good" (first), so nothing is lost. */
export function topThree(bottles: ShelfBottle[]): ShelfBottle[] {
  const top = bottles.filter((b) => b.verdict === 'top');
  const extra = top.slice(3).map((b) => ({ ...b, verdict: 'good' as const }));
  return [...top.slice(0, 3), ...extra, ...bottles.filter((b) => b.verdict !== 'top')];
}

/** Quick answers for "Looking for…", sent with the photos. */
export const LOOKING_FOR = ['Under $50', 'For tonight', 'To age', 'Something new'] as const;

/** Progress while a shelf is read: how long so far, and the picks written so far (shown as they arrive). */
export interface ShelfProgress {
  bottles: ShelfBottle[];
}

// The Anthropic SDK is loaded on first use so it doesn't slow down opening the app.
export async function readShelf(
  photos: Blob[],
  context: string,
  store: string,
  lookingFor: string,
  onProgress?: (p: ShelfProgress) => void,
  signal?: AbortSignal,
): Promise<ShelfOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./shelfClient')).readShelfWithClaude(apiKey, photos, context, store, lookingFor, onProgress, signal);
}

/**
 * The complete objects so far in the array `key` of a JSON answer that is still being written,
 * e.g. completeItems('{"picks":[{"a":1},{"a":', 'picks') → [{a: 1}]. Lets picks appear as they arrive.
 */
export function completeItems(text: string, key: string): unknown[] {
  const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(text);
  if (!m) return [];
  const out: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = m.index + m[0].length; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          /* not a whole object after all */
        }
        start = -1;
      }
    } else if (c === ']' && depth === 0) break;
  }
  return out;
}

export async function checkShelfPrices(report: ShelfReport, indexes: number[], signal?: AbortSignal): Promise<PriceCheckOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./shelfClient')).checkPricesWithClaude(apiKey, report, indexes, signal);
}
