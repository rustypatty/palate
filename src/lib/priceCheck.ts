import type { Wine } from '../types';
import { watchedWines, withPoint } from './priceWatch';

/**
 * Running a price check: one Claude search for every watched bottle, saving the prices
 * found on each wine (so they sync) and the time of the check on this device.
 */

export const PREF_AUTO = 'palate.priceAuto';
export const PREF_CHECKED_AT = 'palate.priceCheckedAt';
export const PREF_NOTICED = 'palate.priceAutoNoticed';

export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Same storage and event as usePref, so open screens update. */
export function writePref<T>(key: string, v: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(`palate:${key}`));
}

export type CheckResult = { ok: true; found: number; watched: number } | { ok: false; reason: string };

let running: Promise<CheckResult> | null = null;
let lastError: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const priceCheck = {
  running: () => running !== null,
  error: () => lastError,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Check every watched bottle now. Nothing watched: nothing to check, no cost. */
export function runPriceCheck(wines: Wine[]): Promise<CheckResult> {
  if (running) return running;
  const watched = watchedWines(wines);
  if (!watched.length) return Promise.resolve({ ok: false, reason: 'nothing is being watched' });
  lastError = null;
  running = (async (): Promise<CheckResult> => {
    const { getApiKey } = await import('./labelReader');
    const apiKey = getApiKey();
    if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
    const out = await (await import('./priceCheckClient')).checkPricesWithClaude(apiKey, watched);
    if (!out.ok) return out;
    const { db, updateWine } = await import('../db');
    for (const [id, point] of out.prices) {
      const fresh = await db.wines.get(id);
      if (fresh) await updateWine(id, { priceHistory: withPoint(fresh.priceHistory, point) });
    }
    writePref(PREF_CHECKED_AT, out.at);
    return { ok: true, found: out.prices.size, watched: watched.length };
  })()
    .catch((e: unknown): CheckResult => ({ ok: false, reason: e instanceof Error ? e.message : 'something went wrong' }))
    .then((r) => {
      if (!r.ok) lastError = r.reason;
      return r;
    })
    .finally(() => {
      running = null;
      notify();
    });
  notify();
  return running;
}
