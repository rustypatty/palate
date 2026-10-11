// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createWine, emptyDraft, PalateDB } from '../db';
import { wine } from '../test/fixtures';
import type { BlindGuess } from '../types';
import { blindRecord, checkGuess, emptyGuess, grapeChoices, regionChoices, revealNotes, saveBlind } from './blind';

const chinon = wine({ id: 'chinon', producer: 'Bernard Baudry', name: 'Chinon', vintage: 2020, country: 'France', region: 'Chinon', grapes: [], style: 'red', price: 28 });
const merlotGuess: BlindGuess = { style: 'red', grape: 'Merlot', country: 'France', region: 'Bordeaux', vintage: 2019, price: '20to40', noticed: ['Red fruit', 'High acid', 'Herbal'] };

describe('checking a blind guess', () => {
  it('scores each guess, using the appellation guide when the wine names no grape', () => {
    const checks = checkGuess(chinon, merlotGuess);
    expect(checks.map((c) => [c.key, c.right])).toEqual([
      ['style', true],
      ['grape', false],
      ['country', true],
      ['region', false],
      ['vintage', true],
      ['price', true],
    ]);
    expect(checks.find((c) => c.key === 'grape')!.was).toBe('Cabernet Franc');
    expect(checks.find((c) => c.key === 'region')!.was).toBe('Chinon (Loire)');
  });

  it('counts the area as the right region, and a grape by any of its names', () => {
    const checks = checkGuess(chinon, { ...merlotGuess, grape: 'Cabernet Franc', region: 'Loire' });
    expect(checks.every((c) => c.right)).toBe(true);
    const shiraz = wine({ producer: 'X', name: 'Shiraz', grapes: ['Syrah'], country: 'Australia', region: 'Barossa Valley', style: 'red' });
    expect(checkGuess(shiraz, { ...emptyGuess(), grape: 'Shiraz' }).find((c) => c.key === 'grape')!.right).toBe(true);
  });

  it('leaves out what the wine doesn’t say, and counts "Not sure" as a miss', () => {
    const nv = wine({ producer: 'Maison', name: 'Brut', vintage: 'NV', price: null, style: 'sparkling', country: 'France', region: '' });
    const checks = checkGuess(nv, emptyGuess());
    expect(checks.map((c) => c.key)).toEqual(['style', 'country']);
    expect(checks.every((c) => !c.right && c.said === 'Not sure')).toBe(true);
  });

  it('explains a near miss from the guide, for free', () => {
    const notes = revealNotes(chinon, merlotGuess, checkGuess(chinon, merlotGuess));
    expect(notes).toEqual(['Chinon is usually made from Cabernet Franc.', 'Bordeaux grows Cabernet Franc too, so you were close.']);
  });
});

describe('choices', () => {
  it('offers grapes for the colour, then your own', () => {
    const mine = [wine({ producer: 'A', grapes: ['Mencía'], style: 'red' })];
    const reds = grapeChoices('red', mine);
    expect(reds).toContain('Pinot Noir');
    expect(reds).not.toContain('Chardonnay');
    expect(reds.at(-1)).toBe('Mencía');
  });

  it('offers the guide’s areas for a country, then regions from your wines', () => {
    const mine = [wine({ producer: 'A', country: 'Lebanon', region: 'Bekaa Valley' }), wine({ producer: 'B', country: 'USA', region: 'Napa Valley' })];
    expect(regionChoices('France', mine)).toContain('Loire');
    expect(regionChoices('France', mine)).not.toContain('France (sparkling)');
    expect(regionChoices('Lebanon', mine)).toEqual(['Bekaa Valley']);
    // Napa Valley is the guide's Napa: offered once.
    expect(regionChoices('USA', mine).filter((r) => r.startsWith('Napa'))).toEqual(['Napa']);
    expect(regionChoices(null, mine)).toEqual([]);
  });
});

describe('saving and the record', () => {
  let db: PalateDB;
  beforeEach(async () => {
    db = new PalateDB(`blind-${Math.random()}`);
    await db.open();
  });

  it('gives an unrated wine your blind rating, but keeps a rating it already has', async () => {
    const fresh = await createWine({ ...emptyDraft(), producer: 'Bernard Baudry', name: 'Chinon', region: 'Chinon', country: 'France', style: 'red', owned: 1 }, db);
    const rated = await createWine({ ...emptyDraft(), producer: 'Ridge', name: 'Lytton Springs', style: 'red', grapes: ['Zinfandel'], rating: 'loved', owned: 1 }, db);
    const t = await saveBlind((await db.wines.get(fresh))!, merlotGuess, 'liked', db, Date.parse('2026-10-11T20:00:00Z'));
    await saveBlind((await db.wines.get(rated))!, { ...emptyGuess(), grape: 'Zinfandel' }, 'wouldnt', db);

    const a = (await db.wines.get(fresh))!;
    expect(a).toMatchObject({ rating: 'liked', tastedOn: '2026-10-11' });
    expect(a.blind).toEqual([t]);
    expect(t).toMatchObject({ right: 2, of: 4, rating: 'liked' });
    const b = (await db.wines.get(rated))!;
    expect(b.rating).toBe('loved');
    expect(b.blind![0].rating).toBe('wouldnt');
  });

  it('adds up your record per grape and spots repeat mix-ups', () => {
    const syrah = (id: string, said: string) =>
      wine({ id, producer: id, grapes: ['Syrah'], style: 'red', blind: [{ at: 1, guess: { ...emptyGuess(), grape: said }, rating: null, right: said === 'Syrah' ? 1 : 0, of: 1 }] });
    const rec = blindRecord([syrah('a', 'Malbec'), syrah('b', 'Malbec'), syrah('c', 'Shiraz'), chinon]);
    expect(rec).toMatchObject({ tastings: 3, grapes: [{ grape: 'Syrah', tried: 3, named: 1 }], mixups: [{ said: 'Malbec', was: 'Syrah', times: 2 }] });
  });
});
