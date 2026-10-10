import { describe, expect, it } from 'vitest';
import { cleanReason } from '../components/Shelf';
import { wine } from '../test/fixtures';
import { completeItems, loadShelf, saveShelf, SHELF_TTL, shelfBudget, shelfContext, shelfTitle, topThree, withinBudget, type SavedShelf, type ShelfBottle } from './shelf';

describe('Snap a shelf', () => {
  it('tells Claude your ratings and your own notes', () => {
    const text = shelfContext(
      [
        wine({ producer: 'Renato Ratti', name: 'Barolo Marcenasco', vintage: 2021, rating: 'loved', notes: 'Gripping tannin, lovely.' }),
        wine({ producer: 'Château Puy d’Amour', name: 'Côtes de Bourg', rating: 'wouldnt', notes: 'No tannin grip, little fruit.' }),
        wine({ producer: 'Unrated', name: 'Bottle', rating: null }),
      ],
      undefined,
    );
    expect(text).toContain('Loved: Renato Ratti Barolo Marcenasco 2021');
    expect(text).toContain('my notes: "Gripping tannin, lovely."');
    expect(text).toContain('Would not buy again: Château Puy d’Amour');
    expect(text).not.toContain('Unrated');
  });

  it('picks out each pick as soon as it has been written in full', () => {
    const partial = '{"picks":[{"producer":"Caiarossa","why":"Has a } and a \\" inside"},{"producer":"Argi';
    expect(completeItems(partial, 'picks')).toEqual([{ producer: 'Caiarossa', why: 'Has a } and a " inside' }]);
    expect(completeItems('{"picks":[{"a":1}],"also_good":[{"b":2},{"b":', 'also_good')).toEqual([{ b: 2 }]);
    expect(completeItems('{"picks":[{"a":1}],"also_good":[]', 'picks')).toEqual([{ a: 1 }]);
    expect(completeItems('{"decision":"', 'picks')).toEqual([]);
  });

  it('forgets a shelf read before the shorter answers, instead of showing it half-empty', () => {
    const lean: SavedShelf = { at: Date.now(), store: 'Total Wine', photos: 2, report: { decision: 'If you get one: X.', lesson: '', bottles: [], unreadable: '' } };
    saveShelf(lean);
    expect(loadShelf()).toEqual(lean);
    localStorage.setItem('palate.shelf', JSON.stringify({ at: 1, store: 'Total Wine', photos: 2, report: { summary: 'old', bottles: [], comparisons: [] } }));
    expect(loadShelf()).toBeNull();
    saveShelf(null);
  });

  it('reads a budget from "Looking for", else uses the profile one', () => {
    expect(shelfBudget('under $100', null)).toBe(100);
    expect(shelfBudget('Tuscany, below 60', 100)).toBe(60);
    expect(shelfBudget('Super Tuscan $80 max', null)).toBe(80);
    expect(shelfBudget('For tonight', 100)).toBe(100);
    expect(shelfBudget('', null)).toBeNull();
  });

  it('keeps over-budget bottles out of the picks, with at most one near it among "also good"', () => {
    const b = (wine: string, price: number, verdict: 'top' | 'good', deal = ''): ShelfBottle => ({
      producer: 'P', wine, vintage: '', region: '', country: '', grapes: [], style: 'red', price_usd: price, deal, score: '', where: '', verdict, taste: [], why: '', price_call: 'unknown', tip: '',
    });
    // As in a real read: a $154.99 Brunello as No. 1 with its price left unread, and three more over $100 below.
    const out = withinBudget(
      [b('Tenuta Nuova', 0, 'top'), b('Paganico', 59.99, 'top'), b('Rosso', 27.99, 'top'), b('Argiano', 109.99, 'good', '$98.99 in a mix of 6'), b('I Sodi', 119.99, 'good', '$107.99 in a mix of 6'), b('Saffredi', 149.99, 'good'), b('Casalino', 49.99, 'good')],
      100,
    );
    expect(out.map((x) => [x.wine, x.verdict])).toEqual([
      ['Paganico', 'top'],
      ['Rosso', 'top'],
      ['Casalino', 'good'],
      ['Argiano', 'good'],
    ]);
    expect(withinBudget([b('X', 150, 'top')], null)).toHaveLength(1);
  });

  it('keeps three on top and at most three under "Also good", further picks first', () => {
    const b = (wine: string, verdict: 'top' | 'good') => ({ wine, verdict }) as unknown as ShelfBottle;
    const out = topThree([b('A', 'top'), b('B', 'top'), b('C', 'top'), b('D', 'top'), b('E', 'good'), b('F', 'good'), b('G', 'good')]);
    expect(out.map((x) => `${x.wine}:${x.verdict}`)).toEqual(['A:top', 'B:top', 'C:top', 'D:good', 'E:good', 'F:good']);
  });

  it('lets a shelf result go after an hour', () => {
    const report = { decision: 'If you get one: X.', lesson: '', bottles: [], unreadable: '' };
    saveShelf({ at: Date.now() - SHELF_TTL - 1000, store: 'Total Wine', photos: 2, report });
    expect(loadShelf()).toBeNull();
    saveShelf({ at: Date.now() - SHELF_TTL + 60_000, store: 'Total Wine', photos: 2, report });
    expect(loadShelf()).not.toBeNull();
    saveShelf(null);
  });

  it('names bottles plainly', () => {
    expect(shelfTitle({ producer: 'Renato Ratti', wine: 'Barolo Marcenasco', vintage: '2021' })).toBe('Renato Ratti Barolo Marcenasco 2021');
  });

  it('turns dashes into commas or full stops, but keeps price ranges', () => {
    expect(cleanReason('Gamay — lighter than you like')).toBe('Gamay, lighter than you like');
    expect(cleanReason('Firm tannin — The opposite of soft')).toBe('Firm tannin. The opposite of soft');
    expect(cleanReason('Usually $75–90')).toBe('Usually $75–90');
  });
});
