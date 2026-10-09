import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { cheapestVerified, priceCheckPrompt } from './priceCheckClient';
import { canWatch, dropFor, dropReason, dueForCheck, isDrop, lastCheckedAt, priceDrops, watchedWines, isWatched, WEEK_MS, withPoint } from './priceWatch';
import { normalizeUrl } from './likeThis';
import type { PricePoint } from '../types';

const day = 24 * 3600 * 1000;
const at = (iso: string) => Date.parse(iso);
const pt = (date: string, price: number, store = 'Total Wine'): PricePoint => ({ date: `${date}T12:00:00.000Z`, price, store, url: 'https://www.totalwine.com/wine/p/1' });

describe('who can be watched', () => {
  it('is Loved wines and Want to try bottles', () => {
    expect(canWatch(wine({ rating: 'loved' }))).toBe(true);
    expect(canWatch(wine({ list: 'want' }))).toBe(true);
    expect(canWatch(wine({ rating: 'liked' }))).toBe(false);
    expect(canWatch(wine({ list: 'passed', rating: 'loved' }))).toBe(false);
  });

  it('watches them unless you switch the bell off', () => {
    const ws = [wine({ rating: 'loved' }), wine({ list: 'want' }), wine({ rating: 'loved', watchOff: true }), wine({ rating: 'liked' })];
    expect(watchedWines(ws)).toHaveLength(2);
    expect(isWatched(wine({ rating: 'loved', watch: false }))).toBe(true);
  });
});

describe('what counts as a drop', () => {
  it('is 10% or more below the last recorded price', () => {
    expect(isDrop([pt('2026-09-01', 50)], { date: '2026-09-08T12:00:00Z', price: 45 }).drop).toBe(true);
    expect(isDrop([pt('2026-09-01', 40), pt('2026-09-08', 50)], { date: '2026-09-15T12:00:00Z', price: 46 }).drop).toBe(false);
  });

  it('or the lowest in 180 days', () => {
    const h = [pt('2026-05-01', 40), pt('2026-08-01', 48), pt('2026-09-01', 44)];
    const d = isDrop(h, { date: '2026-09-08T12:00:00Z', price: 39 });
    expect(d).toEqual({ drop: true, lowest: true, was: 44 });
    // An older, lower price falls outside the six months.
    const old = [pt('2025-12-01', 30), pt('2026-08-01', 44)];
    expect(isDrop(old, { date: '2026-09-08T12:00:00Z', price: 42 }).lowest).toBe(true);
    expect(isDrop([pt('2026-08-01', 44)], { date: '2026-09-08T12:00:00Z', price: 44 }).drop).toBe(false);
  });

  it('uses the price you paid before anything was recorded', () => {
    expect(isDrop([], { date: '2026-09-08T12:00:00Z', price: 40 }, 50)).toEqual({ drop: true, lowest: false, was: 50 });
    expect(isDrop([], { date: '2026-09-08T12:00:00Z', price: 48 }, 50).drop).toBe(false);
    expect(isDrop([], { date: '2026-09-08T12:00:00Z', price: 48 }).drop).toBe(false);
  });
});

describe('drops on screen', () => {
  const now = at('2026-09-10T12:00:00Z');
  const loved = wine({ rating: 'loved', price: 60, priceHistory: [pt('2026-09-01', 55), pt('2026-09-08', 48)] });
  const want = wine({ list: 'want', priceHistory: [pt('2026-09-01', 30), pt('2026-09-08', 26)] });
  const steady = wine({ rating: 'loved', priceHistory: [pt('2026-09-01', 30), pt('2026-09-08', 30)] });
  const off = wine({ rating: 'loved', watchOff: true, priceHistory: [pt('2026-09-01', 55), pt('2026-09-08', 40)] });

  it('shows recent drops on watched bottles, biggest saving first', () => {
    const ds = priceDrops([steady, want, loved, off], now);
    expect(ds.map((d) => d.wine.id)).toEqual([want.id, loved.id]);
    expect(ds[1]).toMatchObject({ was: 55, lowest: true });
  });

  it('says why', () => {
    expect(dropReason(dropFor(loved, now)!)).toBe('Loved · lowest in 6 months');
    expect(dropReason(dropFor(want, now)!)).toBe('Want to try');
    const tenth = wine({ rating: 'loved', priceHistory: [pt('2026-04-01', 30), pt('2026-08-01', 50), pt('2026-09-08', 40)] });
    expect(dropReason(dropFor(tenth, now)!)).toBe('Loved · 20% less');
  });

  it('lets an old drop go after two weeks', () => {
    expect(dropFor(loved, now + 20 * day)).toBeNull();
  });

  it('keeps the history short', () => {
    let h: PricePoint[] = [];
    for (let i = 0; i < 70; i++) h = withPoint(h, pt('2026-01-01', i));
    expect(h).toHaveLength(60);
    expect(h[59].price).toBe(69);
  });
});

describe('weekly check', () => {
  const now = at('2026-09-10T12:00:00Z');
  it('runs only with auto-check on, something watched and a week gone', () => {
    expect(dueForCheck({ auto: true, watched: 3, last: null, now })).toBe(true);
    expect(dueForCheck({ auto: true, watched: 3, last: now - WEEK_MS - 1, now })).toBe(true);
    expect(dueForCheck({ auto: true, watched: 3, last: now - 2 * day, now })).toBe(false);
    expect(dueForCheck({ auto: false, watched: 3, last: null, now })).toBe(false);
    expect(dueForCheck({ auto: true, watched: 0, last: null, now })).toBe(false);
  });

  it('counts a check made on another device', () => {
    const w = wine({ rating: 'loved', priceHistory: [pt('2026-09-08', 30)] });
    expect(lastCheckedAt([w], null)).toBe(at('2026-09-08T12:00:00Z'));
    expect(lastCheckedAt([w], at('2026-09-09T00:00:00Z'))).toBe(at('2026-09-09T00:00:00Z'));
    expect(lastCheckedAt([], null)).toBeNull();
  });
});

describe('batched check', () => {
  const a = wine({ producer: 'Prova', name: 'Barolo', rating: 'loved', priceHistory: [pt('2026-09-01', 50)] });
  const b = wine({ producer: 'Esempio', name: 'Chianti', list: 'want' });

  it('asks about every watched bottle in one prompt', () => {
    const p = priceCheckPrompt([a, b]);
    expect(p).toContain('1. Prova Barolo · last seen $50 at Total Wine');
    expect(p).toContain('2. Esempio Chianti');
  });

  it('keeps only store pages that turned up in the search, cheapest per bottle', () => {
    const tw = 'https://www.totalwine.com/wine/red-wine/barolo/p/123';
    const specs = 'https://www.specsonline.com/barolo-123';
    const madeUp = 'https://www.totalwine.com/wine/made-up/p/999';
    const other = 'https://www.wine.com/barolo';
    const seen = new Set([tw, specs, other].map(normalizeUrl));
    const out = cheapestVerified(
      [a, b],
      {
        bottles: [
          { n: 1, offers: [{ url: tw, price_usd: 46.99 }, { url: specs, price_usd: 44.5 }, { url: other, price_usd: 30 }] },
          { n: 2, offers: [{ url: madeUp, price_usd: 20 }] },
          { n: 7, offers: [{ url: tw, price_usd: 1 }] },
        ],
      },
      seen,
      at('2026-09-10T12:00:00Z'),
    );
    expect(out.size).toBe(1);
    expect(out.get(a.id)).toEqual({ date: '2026-09-10T12:00:00.000Z', price: 44.5, store: 'Spec’s', url: specs });
  });
});
