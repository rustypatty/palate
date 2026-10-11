// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createWine, emptyDraft, PalateDB, updateWine } from '../db';
import { wine } from '../test/fixtures';
import type { DrinkWindow, WineTake } from '../types';
import { currentWindow, drinkSoon, fillWindows, formatWindow, needsWindow, resetAsked, windowFromText, windowStatus, type Estimate } from './drinkWindow';
import { rankTonight } from './tonight';

const now = new Date('2026-10-07T19:00:00');
const win = (from: number, to: number, source: DrinkWindow['source'] = 'claude', vintage: DrinkWindow['vintage'] = 2020): DrinkWindow => ({ from, to, source, vintage });
const take = (serve: string): WineTake => ({ whatItIs: '', taste: '', fit: '', serve, caveat: '', writtenAt: now.getTime(), rating: null });

describe('reading best years from text', () => {
  it('reads ranges, "until" years, spans of years and "drink now"', () => {
    expect(windowFromText('Decant an hour; drink 2027–2035.', 2026)).toEqual({ from: 2027, to: 2035 });
    expect(windowFromText('Lovely now through 2030.', 2026)).toEqual({ from: 2026, to: 2030 });
    expect(windowFromText('Best within 3–5 years.', 2026)).toEqual({ from: 2026, to: 2031 });
    expect(windowFromText('Ready now, with roast chicken.', 2026)).toEqual({ from: 2026, to: 2027 });
    expect(windowFromText('Serve at 16°C with lamb.', 2026)).toBeNull();
  });
});

describe('best years', () => {
  it('says where a bottle is in its window', () => {
    expect(windowStatus(win(2028, 2035), now)).toBe('early');
    expect(windowStatus(win(2024, 2030), now)).toBe('ready');
    expect(windowStatus(win(2022, 2027), now)).toBe('soon');
    expect(windowStatus(win(2020, 2026), now)).toBe('soon');
    expect(windowStatus(win(2018, 2025), now)).toBe('past');
  });

  it('formats a range briefly', () => {
    expect(formatWindow(win(2026, 2032))).toBe('2026–32');
    expect(formatWindow(win(2027, 2027))).toBe('2027');
    expect(formatWindow(win(2095, 2105))).toBe('2095–2105');
  });

  it('needs a new window when the vintage changed, unless you set it', () => {
    const w = wine({ producer: 'Ridge', vintage: 2021, owned: 1, drinkWindow: win(2024, 2030, 'claude', 2020) });
    expect(currentWindow(w)).toBeNull();
    expect(needsWindow(w)).toBe(true);
    const mine = { ...w, drinkWindow: win(2024, 2030, 'you', 2020) };
    expect(currentWindow(mine)).toEqual(mine.drinkWindow);
    expect(needsWindow(mine)).toBe(false);
  });

  it('only gives windows to bottles you own', () => {
    expect(needsWindow(wine({ producer: 'Ridge', owned: 0 }))).toBe(false);
    expect(needsWindow(wine({ producer: 'Ridge', owned: 1, list: 'want' }))).toBe(false);
    expect(needsWindow(wine({ producer: 'Ridge', owned: 1 }))).toBe(true);
  });

  it('lists bottles at the end of their window or past it, soonest first', () => {
    const wines = [
      wine({ id: 'young', producer: 'A', vintage: 2020, owned: 1, drinkWindow: win(2028, 2035) }),
      wine({ id: 'ready', producer: 'B', vintage: 2020, owned: 1, drinkWindow: win(2024, 2030) }),
      wine({ id: 'soon', producer: 'C', vintage: 2020, owned: 1, drinkWindow: win(2022, 2027) }),
      wine({ id: 'past', producer: 'D', vintage: 2020, owned: 1, drinkWindow: win(2018, 2025) }),
      wine({ id: 'drunk', producer: 'E', vintage: 2020, owned: 0, drinkWindow: win(2018, 2025) }),
    ];
    expect(drinkSoon(wines, now).map((w) => w.id)).toEqual(['past', 'soon']);
  });
});

describe('Tonight and best years', () => {
  it('opens a bottle at the end of its window before a young one', () => {
    const base = { producer: 'X', grapes: ['Sangiovese'], style: 'red' as const, rating: 'loved' as const, owned: 1, vintage: 2020 as const, price: 30 };
    const young = wine({ ...base, id: 'young', name: 'Young Chianti', drinkWindow: win(2029, 2036) });
    const ending = wine({ ...base, id: 'ending', name: 'Old Chianti', drinkWindow: win(2020, 2027) });
    const ranked = rankTonight([young, ending], 'pasta', now);
    expect(ranked.map((p) => p.wine.id)).toEqual(['ending', 'young']);
    expect(ranked[0].reason).toMatch(/end of its best years/);
    expect(ranked[1].reason).toMatch(/still young: better from 2029/);
  });
});

describe('filling windows in', () => {
  let db: PalateDB;
  beforeEach(async () => {
    db = new PalateDB(`dw-${Math.random()}`);
    await db.open();
    resetAsked();
  });

  const counting = (answer: (n: number) => { from: number; to: number } | null) => {
    const calls: number[] = [];
    const estimate: Estimate = async (asks) => {
      calls.push(asks.length);
      return { ok: true, windows: asks.map((_, i) => answer(i)) };
    };
    return { calls, estimate };
  };

  it('reads the take for free, and asks Claude once for the rest', async () => {
    const fromTake = await createWine({ ...emptyDraft(), producer: 'Ridge', name: 'Lytton Springs', vintage: 2021, owned: 1, take: take('Drink 2025–2033.') }, db);
    const asked = await createWine({ ...emptyDraft(), producer: 'Felsina', name: 'Chianti Classico', vintage: 2022, owned: 2 }, db);
    await createWine({ ...emptyDraft(), producer: 'Not Mine', owned: 0 }, db);
    const { calls, estimate } = counting(() => ({ from: 2025, to: 2029 }));

    expect(await fillWindows(await db.wines.toArray(), db, estimate, now)).toBe(2);
    expect(calls).toEqual([1]);
    expect((await db.wines.get(fromTake))!.drinkWindow).toEqual({ from: 2025, to: 2033, source: 'take', vintage: 2021 });
    expect((await db.wines.get(asked))!.drinkWindow).toEqual({ from: 2025, to: 2029, source: 'claude', vintage: 2022 });
    // Every bottle has one: nothing more to ask.
    expect(await fillWindows(await db.wines.toArray(), db, estimate, now)).toBe(0);
    expect(calls).toEqual([1]);
  });

  it('asks about a bottle Claude couldn’t place only once a session', async () => {
    await createWine({ ...emptyDraft(), producer: 'Mystery', owned: 1 }, db);
    const { calls, estimate } = counting(() => null);
    await fillWindows(await db.wines.toArray(), db, estimate, now);
    await fillWindows(await db.wines.toArray(), db, estimate, now);
    expect(calls).toEqual([1]);
  });

  it('never replaces a window you set, even one set while Claude was answering', async () => {
    const id = await createWine({ ...emptyDraft(), producer: 'Ridge', vintage: 2021, owned: 1 }, db);
    const estimate: Estimate = async (asks) => {
      await updateWine(id, { drinkWindow: win(2030, 2040, 'you', 2021) }, db);
      return { ok: true, windows: asks.map(() => ({ from: 2025, to: 2028 })) };
    };
    expect(await fillWindows(await db.wines.toArray(), db, estimate, now)).toBe(0);
    expect((await db.wines.get(id))!.drinkWindow).toMatchObject({ from: 2030, to: 2040, source: 'you' });
  });

  it('keeps going without a key or connection: nothing saved, nothing thrown', async () => {
    await createWine({ ...emptyDraft(), producer: 'Ridge', owned: 1 }, db);
    const failing: Estimate = async () => ({ ok: false, reason: 'no key' });
    expect(await fillWindows(await db.wines.toArray(), db, failing, now)).toBe(0);
  });
});
