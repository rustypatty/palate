import { db, updateWine, type PalateDB } from '../db';
import type { DrinkWindow, Wine } from '../types';
import type { WindowAsk, WindowsOutcome } from './drinkWindowClient';

/**
 * When a bottle you own is at its best: a range of years saved on the wine, so it syncs, can be
 * edited, and drives the Drink soon shelf and Tonight. Filled in for free from Palate's take when
 * its "Serve it" names one, otherwise estimated by Claude for all your bottles in one request
 * (drinkWindowClient.ts).
 */

export type WindowStatus = 'early' | 'ready' | 'soon' | 'past';

export const STATUS_LABEL: Record<WindowStatus, string> = {
  early: 'Too young',
  ready: 'Ready',
  soon: 'Drink soon',
  past: 'Past its best',
};

/** Within this many years of the end of its window, a bottle is "Drink soon". */
const SOON_YEARS = 1;

const thisYear = (now: Date) => now.getFullYear();

/** The years a take's "Serve it" text gives, counted from the year it was written; null if none. */
export function windowFromText(text: string, year: number): { from: number; to: number } | null {
  const range = text.match(/\b(20\d\d)\s*(?:[-–]|to)\s*(?:about\s+)?(20\d\d)\b/);
  if (range) return ordered(Number(range[1]), Number(range[2]));
  const until =
    text.match(/\b(?:now|today)\b[^.;]*?\b(?:to|until|through|till|by)\s+(?:about\s+|roughly\s+|around\s+)?(20\d\d)\b/i) ??
    text.match(/\b(?:through|until|till)\s+(?:about\s+|roughly\s+|around\s+)?(20\d\d)\b/i);
  if (until) return ordered(year, Number(until[1]));
  const years = text.match(/\b(?:within|for)\s+(?:about\s+|around\s+|the next\s+)*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s+years?\b/i);
  if (years) return ordered(year, year + Number(years[2] ?? years[1]));
  if (/\b(?:ready now|drink (?:it )?now)\b/i.test(text)) return { from: year, to: year + 1 };
  return null;
}

function ordered(a: number, b: number): { from: number; to: number } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/** The saved window, if it still belongs to this vintage (a changed vintage needs a new one). */
export function currentWindow(w: Wine): DrinkWindow | null {
  const dw = w.drinkWindow;
  return dw && dw.vintage === w.vintage ? dw : null;
}

/** Worth a window: a bottle you own, with a name, and no window for this vintage yet. */
export function needsWindow(w: Wine): boolean {
  if (w.list || w.owned <= 0 || !(w.producer || w.name)) return false;
  return !currentWindow(w);
}

export function windowStatus(dw: { from: number; to: number }, now = new Date()): WindowStatus {
  const y = thisYear(now);
  if (y < dw.from) return 'early';
  if (y > dw.to) return 'past';
  if (y >= dw.to - SOON_YEARS) return 'soon';
  return 'ready';
}

/** "2026–32", or "2027" for a single year. */
export function formatWindow(dw: { from: number; to: number }): string {
  if (dw.from === dw.to) return String(dw.from);
  return Math.floor(dw.from / 100) === Math.floor(dw.to / 100) ? `${dw.from}–${String(dw.to).slice(2)}` : `${dw.from}–${dw.to}`;
}

/** Bottles at home to open before they fade: in their last year or past it, soonest first. */
export function drinkSoon(wines: Wine[], now = new Date()): Wine[] {
  return wines
    .filter((w) => !w.list && w.owned > 0)
    .flatMap((w) => {
      const dw = currentWindow(w);
      if (!dw) return [];
      const s = windowStatus(dw, now);
      return s === 'soon' || s === 'past' ? [{ w, to: dw.to }] : [];
    })
    .sort((a, b) => a.to - b.to || a.w.id.localeCompare(b.w.id))
    .map((x) => x.w);
}

/** A window from the take's "Serve it", for a wine that needs one. Free. */
export function windowFromTake(w: Wine): DrinkWindow | null {
  const t = w.take;
  if (!t?.serve.trim()) return null;
  const range = windowFromText(t.serve, new Date(t.writtenAt).getFullYear());
  return range ? { ...range, source: 'take', vintage: w.vintage } : null;
}

// --- Filling windows in ---

/** Bottles asked about this session (id + vintage), so a failed or empty answer isn't paid for twice. */
const asked = new Set<string>();
let running: Promise<number> | null = null;
/** Bottles per Claude request; the rest wait for the next pass. */
export const MAX_PER_REQUEST = 40;

export type Estimate = (asks: WindowAsk[], year: number) => Promise<WindowsOutcome>;

async function estimateWithKey(asks: WindowAsk[], year: number): Promise<WindowsOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'no key' };
  return (await import('./drinkWindowClient')).estimateWindowsWithClaude(apiKey, asks, year);
}

const askKey = (w: Wine) => `${w.id}:${w.vintage ?? ''}`;

/**
 * Gives every bottle you own a window: from its take when that names one (free), else one Claude
 * request for the rest. Re-reads each wine before saving, so a change made meanwhile is kept.
 * Returns how many wines were updated.
 */
export function fillWindows(wines: Wine[], database: PalateDB = db, estimate: Estimate = estimateWithKey, now = new Date()): Promise<number> {
  running ??= (async () => {
    let saved = 0;
    const save = async (w: Wine, drinkWindow: DrinkWindow) => {
      const cur = await database.wines.get(w.id);
      if (!cur || !needsWindow(cur) || cur.vintage !== w.vintage) return;
      await updateWine(w.id, { drinkWindow }, database);
      saved++;
    };
    const rest: Wine[] = [];
    for (const w of wines.filter(needsWindow)) {
      const dw = windowFromTake(w);
      if (dw) await save(w, dw);
      else rest.push(w);
    }
    const ask = rest.filter((w) => !asked.has(askKey(w))).slice(0, MAX_PER_REQUEST);
    if (!ask.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) return saved;
    for (const w of ask) asked.add(askKey(w));
    const out = await estimate(ask.map(toAsk), now.getFullYear()).catch((): WindowsOutcome => ({ ok: false, reason: 'unexpected error' }));
    if (!out.ok) return saved;
    for (const [i, w] of ask.entries()) {
      const win = out.windows[i];
      if (win) await save(w, { ...win, source: 'claude', vintage: w.vintage });
    }
    return saved;
  })().finally(() => {
    running = null;
  });
  return running;
}

function toAsk(w: Wine): WindowAsk {
  return {
    producer: w.producer,
    name: w.name,
    vintage: w.vintage === null ? '' : String(w.vintage),
    region: w.region,
    country: w.country,
    style: w.style ?? '',
    grapes: w.grapes,
  };
}

/** For tests: forget which bottles were asked about. */
export function resetAsked() {
  asked.clear();
}
