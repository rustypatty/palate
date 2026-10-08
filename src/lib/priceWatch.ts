import type { PricePoint, Wine } from '../types';

/**
 * Price watch: Loved wines and Want to try bottles with the bell on get their price
 * checked at your stores, in one Claude search for all of them, about once a week.
 */

export const WEEK_MS = 7 * 24 * 3600 * 1000;
export const DROP_SHARE = 0.1;
export const LOW_WINDOW_DAYS = 180;
/** A drop stays on the home screen and the watch screen this long. */
export const DROP_SHOWN_MS = 14 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const KEEP_POINTS = 60;

/** The bell is for Loved wines and Want to try bottles. */
export const canWatch = (w: Wine) => w.list === 'want' || (!w.list && w.rating === 'loved');
export const watchedWines = (wines: Wine[]) => wines.filter((w) => w.watch && canWatch(w));

export interface Drop {
  wine: Wine;
  now: PricePoint;
  /** The price before: the last one recorded, else what you paid. */
  was: number | null;
  /** The lowest price in six months. */
  lowest: boolean;
}

/**
 * Is a new price a drop? At least 10% below the last recorded price, or the lowest in 180 days.
 * `baseline` stands in for the last price when nothing was recorded yet (the price you paid).
 */
export function isDrop(history: PricePoint[], point: Pick<PricePoint, 'date' | 'price'>, baseline: number | null = null): { drop: boolean; lowest: boolean; was: number | null } {
  const last = history.length ? history[history.length - 1].price : baseline;
  const at = Date.parse(point.date);
  const recent = history.filter((p) => at - Date.parse(p.date) <= LOW_WINDOW_DAYS * DAY_MS).map((p) => p.price);
  const lowest = recent.length > 0 && point.price < Math.min(...recent);
  const tenth = last !== null && last > 0 && point.price <= last * (1 - DROP_SHARE) + 1e-9;
  return { drop: lowest || tenth, lowest, was: last };
}

/** The bottle's latest price, if it was a drop and is recent enough to show. */
export function dropFor(w: Wine, now = Date.now()): Drop | null {
  const h = w.priceHistory ?? [];
  if (!h.length || !w.watch || !canWatch(w)) return null;
  const point = h[h.length - 1];
  if (now - Date.parse(point.date) > DROP_SHOWN_MS) return null;
  const d = isDrop(h.slice(0, -1), point, w.price);
  return d.drop ? { wine: w, now: point, was: d.was, lowest: d.lowest } : null;
}

export function priceDrops(wines: Wine[], now = Date.now()): Drop[] {
  return wines
    .map((w) => dropFor(w, now))
    .filter((d): d is Drop => d !== null)
    .sort((a, b) => saving(b) - saving(a));
}

const saving = (d: Drop) => (d.was ? (d.was - d.now.price) / d.was : 0);

/** "Loved · lowest in 6 months", "Loved · 15% less", "Want to try". */
export function dropReason(d: Drop): string {
  if (d.wine.list === 'want') return 'Want to try';
  const what = d.lowest ? 'lowest in 6 months' : d.was ? `${Math.round(saving(d) * 100)}% less` : 'cheaper';
  return `Loved · ${what}`;
}

/** Add a new price, keeping the history short. */
export function withPoint(history: PricePoint[] | undefined, point: PricePoint): PricePoint[] {
  return [...(history ?? []), point].slice(-KEEP_POINTS);
}

/** The latest price seen for a bottle. */
export const latestPrice = (w: Wine): PricePoint | null => w.priceHistory?.at(-1) ?? null;

/** When prices were last checked: on this device, or on another (from the synced histories). */
export function lastCheckedAt(wines: Wine[], local: number | null): number | null {
  const seen = wines.flatMap((w) => (w.priceHistory ?? []).map((p) => Date.parse(p.date))).filter((t) => !Number.isNaN(t));
  const t = Math.max(local ?? 0, ...seen, 0);
  return t > 0 ? t : null;
}

/** Weekly check when the app opens: auto-check on, something watched, more than 7 days since the last. */
export function dueForCheck(opts: { auto: boolean; watched: number; last: number | null; now?: number }): boolean {
  const now = opts.now ?? Date.now();
  return opts.auto && opts.watched > 0 && (opts.last === null || now - opts.last > WEEK_MS);
}

/** "Total Wine, Spec’s" from the latest prices. */
export function storesSeen(wines: Wine[]): string[] {
  return [...new Set(wines.map((w) => latestPrice(w)?.store).filter((s): s is string => Boolean(s)))];
}
