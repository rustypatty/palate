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

/** What a wine is, filled in for the picks only (the menu rarely prints it, and reading it for every wine is slow). */
export interface WineDetails {
  region: string;
  country: string;
  grapes: string[];
  style: WineStyle | 'unknown';
}

export interface ListPick {
  /** Number of the wine in the list (1-based). */
  n: number;
  why: string;
  tag: 'match' | 'value' | 'new' | '';
  details?: WineDetails;
}

export type SectionKind = 'match' | 'value' | 'new' | 'glass';

/** One part of the overview: "Best for you", "Best value", "Something new", "By the glass". */
export interface ListSection {
  kind: SectionKind;
  picks: ListPick[];
}

export interface ListAnswer {
  reply: string;
  picks: ListPick[];
  /** The overview right after a list is read: its picks grouped by kind (picks is then empty). */
  sections?: ListSection[];
  /** A short lesson to remember, or empty. */
  tip: string;
}

export interface ListTurn {
  /** Your question; empty for the overview Palate gives on its own. */
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

/** The overview's sections, in order. "By the glass" only when the list has glass prices. */
export const SECTION_KINDS: SectionKind[] = ['match', 'value', 'new', 'glass'];

/** Under this unless you've set a budget for tonight. */
export const VALUE_LINE = 100;

export function sectionTitle(kind: SectionKind, budget: number | null): string {
  if (kind === 'match') return 'Best for you';
  if (kind === 'value') return `Best value under $${budget ?? VALUE_LINE}`;
  if (kind === 'new') return 'Something new to try';
  return 'By the glass';
}

/** Each section's picks, numbers checked against the list, at most 3 each, glass only with glass prices. */
export function cleanSections(sections: ListSection[], wines: ListWine[]): ListSection[] {
  const hasGlass = wines.some((w) => w.glass_price > 0);
  return SECTION_KINDS.filter((k) => k !== 'glass' || hasGlass)
    .map((kind) => ({
      kind,
      picks: (sections.find((s) => s.kind === kind)?.picks ?? [])
        .filter((p) => p.n >= 1 && p.n <= wines.length && (kind !== 'glass' || wines[p.n - 1].glass_price > 0))
        .slice(0, 3),
    }))
    .filter((s) => s.picks.length > 0);
}

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

/** The wine as read from the list, with what the pick says it is filled in. */
export function withDetails(w: ListWine, p: Pick<ListPick, 'details'>): ListWine {
  const d = p.details;
  if (!d) return w;
  return {
    ...w,
    region: w.region || d.region,
    country: w.country || d.country,
    grapes: w.grapes.length ? w.grapes : d.grapes,
    style: w.style !== 'unknown' ? w.style : d.style,
  };
}

/** Partial answers while Claude is still writing: only what's complete enough to show. */
export function liveAnswer(partial: unknown): ListAnswer | null {
  if (!partial || typeof partial !== 'object') return null;
  const o = partial as { reply?: unknown; picks?: unknown; sections?: unknown; tip?: unknown };
  const picks = (xs: unknown): ListPick[] =>
    Array.isArray(xs) ? xs.filter((p): p is ListPick => typeof p?.n === 'number' && typeof p?.why === 'string').map((p) => ({ ...p, tag: p.tag ?? '' })) : [];
  const sections = Array.isArray(o.sections)
    ? o.sections
        .filter((s): s is ListSection => SECTION_KINDS.includes(s?.kind))
        .map((s) => ({ kind: s.kind, picks: picks(s.picks) }))
        .filter((s) => s.picks.length)
    : undefined;
  return { reply: typeof o.reply === 'string' ? o.reply : '', picks: picks(o.picks), sections, tip: typeof o.tip === 'string' ? o.tip : '' };
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
export async function readWineList(photos: Blob[], signal?: AbortSignal, onProgress?: (wines: number) => void): Promise<ReadListOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./wineListClient')).readWineListWithClaude(apiKey, photos, signal, onProgress);
}

export async function overviewWineList(list: SavedList, context: string, budget: number | null, signal?: AbortSignal, onPartial?: (a: ListAnswer) => void): Promise<AskOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./wineListClient')).overviewWineListWithClaude(apiKey, list, context, budget, signal, onPartial);
}

export async function askWineList(list: SavedList, question: string, context: string, signal?: AbortSignal, onPartial?: (a: ListAnswer) => void): Promise<AskOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./wineListClient')).askWineListWithClaude(apiKey, list, question, context, signal, onPartial);
}
