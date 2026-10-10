import { describe, expect, it } from 'vitest';
import { cleanReason } from '../components/Shelf';
import { wine } from '../test/fixtures';
import { completeItems, loadShelf, saveShelf, shelfContext, shelfTitle, type SavedShelf } from './shelf';

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
    const lean: SavedShelf = { at: 1, store: 'Total Wine', photos: 2, report: { decision: 'If you get one: X.', lesson: '', bottles: [], unreadable: '' } };
    saveShelf(lean);
    expect(loadShelf()).toEqual(lean);
    localStorage.setItem('palate.shelf', JSON.stringify({ at: 1, store: 'Total Wine', photos: 2, report: { summary: 'old', bottles: [], comparisons: [] } }));
    expect(loadShelf()).toBeNull();
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
