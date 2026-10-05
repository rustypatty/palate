import { describe, expect, it } from 'vitest';
import { cleanReason } from '../components/Shelf';
import { wine } from '../test/fixtures';
import { shelfContext, shelfCost, shelfTitle } from './shelf';

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

  it('shows a cost that grows with the number of photos', () => {
    expect(shelfCost(1)).toBe('~13¢');
    expect(shelfCost(8)).toBe('~22¢');
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
