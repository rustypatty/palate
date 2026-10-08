import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { dishFit, isBigRed, median, nextIndex, rankTonight, reasonFor, saveForWeekend } from './tonight';

const now = new Date('2026-10-07T19:00:00');

const barolo = wine({ id: 'barolo', producer: 'Cascina Prova', name: 'Barolo', region: 'Barolo', grapes: ['Nebbiolo'], style: 'red', rating: 'loved', tastedOn: '2026-03-14', owned: 2, price: 55 });
const rhone = wine({ id: 'rhone', producer: 'Domaine Exemple', name: 'Côtes du Rhône', region: 'Côtes du Rhône', grapes: ['Grenache', 'Syrah'], style: 'red', rating: 'loved', owned: 1, price: 18 });
const pinot = wine({ id: 'pinot', producer: 'Test Vineyards', name: 'Pinot Noir', region: 'Willamette Valley', grapes: ['Pinot Noir'], style: 'red', rating: 'liked', owned: 1, price: 28 });
const albarino = wine({ id: 'albarino', producer: 'Bodega Muestra', name: 'Albariño', region: 'Rías Baixas', grapes: ['Albariño'], style: 'white', owned: 1, price: 20 });
const riesling = wine({ id: 'riesling', producer: 'Weingut Probe', name: 'Kabinett', region: 'Mosel', grapes: ['Riesling'], style: 'white', rating: 'liked', owned: 1, price: 22 });
const pauillac = wine({ id: 'pauillac', producer: 'Château Essai', name: 'Grand Vin', region: 'Pauillac', grapes: ['Cabernet Sauvignon', 'Merlot'], style: 'red', rating: 'loved', owned: 1, price: 90 });
const dud = wine({ id: 'dud', producer: 'Nope Cellars', name: 'Red', style: 'red', rating: 'wouldnt', owned: 3, price: 12 });
const gone = wine({ id: 'gone', producer: 'All Drunk', name: 'Chianti Classico', grapes: ['Sangiovese'], style: 'red', rating: 'loved', owned: 0 });
const wanted = wine({ id: 'wanted', producer: 'Someday', name: 'Barbaresco', grapes: ['Nebbiolo'], style: 'red', owned: 1, list: 'want' });
const fizz = wine({ id: 'fizz', producer: 'Maison Bulle', name: 'Brut', region: 'Champagne', grapes: ['Chardonnay', 'Pinot Noir'], style: 'sparkling', owned: 1, price: 45 });
const whiteBdx = wine({ id: 'wbdx', producer: 'Château Blanc', name: 'Bordeaux Blanc', region: 'Bordeaux', grapes: ['Sauvignon Blanc', 'Sémillon'], style: 'white', owned: 1 });

const cellar = [barolo, rhone, pinot, albarino, riesling, pauillac, dud, gone, wanted, fizz, whiteBdx];

describe('dish fit', () => {
  it('matches grapes and regions to dishes', () => {
    expect(dishFit(barolo, 'pasta').fit).toBe(3);
    expect(dishFit(pauillac, 'steak').fit).toBe(3);
    expect(dishFit(rhone, 'steak').fit).toBe(3);
    expect(dishFit(pinot, 'chicken').fit).toBe(3);
    expect(dishFit(albarino, 'fish').fit).toBe(3);
    expect(dishFit(riesling, 'spicy').fit).toBe(3);
    expect(dishFit(rhone, 'pizza').fit).toBeGreaterThanOrEqual(2);
  });

  it('keeps red-wine rules off white wines', () => {
    expect(dishFit(whiteBdx, 'steak').fit).toBe(0);
    expect(dishFit(whiteBdx, 'fish').fit).toBe(3);
  });

  it('uses the colour too: Champagne is a Chardonnay and still bubbles', () => {
    expect(dishFit(fizz, 'glass').fit).toBe(3);
    expect(dishFit(fizz, 'fish').fit).toBe(3);
  });

  it('falls back to the colour when nothing else matches', () => {
    const plain = wine({ name: 'House Rosé', style: 'rose' });
    expect(dishFit(plain, 'fish').fit).toBe(3);
    expect(dishFit(wine({ name: 'Mystery' }), 'steak').fit).toBe(0);
  });

  it('knows the big reds', () => {
    expect(isBigRed(barolo)).toBe(true);
    expect(isBigRed(pauillac)).toBe(true);
    expect(isBigRed(pinot)).toBe(false);
  });
});

describe('ranking tonight', () => {
  it('only offers bottles at home that you would drink again', () => {
    const ids = rankTonight(cellar, 'pasta', now).map((p) => p.wine.id);
    expect(ids).not.toContain('dud');
    expect(ids).not.toContain('gone');
    expect(ids).not.toContain('wanted');
    expect(ids).toHaveLength(8);
  });

  it('puts the best fit plus palate bonus first', () => {
    expect(rankTonight(cellar, 'pasta', now)[0].wine.id).toBe('barolo');
    expect(rankTonight(cellar, 'chicken', now)[0].wine.id).toBe('pinot');
    expect(rankTonight(cellar, 'spicy', now)[0].wine.id).toBe('riesling');
  });

  it('adds Loved +2 and Liked +1', () => {
    const a = wine({ id: 'a', grapes: ['Pinot Noir'], style: 'red', owned: 1, rating: 'loved' });
    const b = wine({ id: 'b', grapes: ['Pinot Noir'], style: 'red', owned: 1, rating: 'liked' });
    const c = wine({ id: 'c', grapes: ['Pinot Noir'], style: 'red', owned: 1 });
    const r = rankTonight([c, b, a], 'chicken', now);
    expect(r.map((p) => p.score)).toEqual([5, 4, 3]);
  });

  it('takes a little off bottles above your median price', () => {
    const cheap = wine({ id: 'cheap', grapes: ['Syrah'], style: 'red', owned: 1, price: 15 });
    const mid = wine({ id: 'mid', grapes: ['Syrah'], style: 'red', owned: 1, price: 25 });
    const dear = wine({ id: 'dear', grapes: ['Syrah'], style: 'red', owned: 1, price: 80 });
    const r = rankTonight([dear, mid, cheap], 'steak', now);
    expect(r[r.length - 1].wine.id).toBe('dear');
    expect(r.find((p) => p.wine.id === 'dear')!.score).toBe(2.5);
  });

  it('saves the good stuff for "Just a glass"', () => {
    const r = rankTonight(cellar, 'glass', now);
    expect(r[0].wine.id).not.toBe('pauillac');
  });

  it('cycles "Another" back to the first', () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
  });

  it('works out the median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

describe('reason line', () => {
  it('is a template from the match and your rating', () => {
    expect(reasonFor(barolo, 'pasta', now)).toBe('Firm enough for a ragù, and you loved it in March.');
    expect(reasonFor(pinot, 'chicken', now)).toBe('Light, juicy, and it won’t overpower a roast bird. You liked it.');
    expect(reasonFor(albarino, 'fish', now)).toBe('Crisp and bright, lovely with fish.');
    expect(reasonFor(riesling, 'glass', now)).toBe('An easy one you liked. Save the good stuff.');
  });

  it('owns up when nothing really matches', () => {
    expect(reasonFor(albarino, 'steak', now)).toBe('Not a classic match, but it’s what you have at home.');
  });

  it('names the year for an older tasting', () => {
    expect(reasonFor({ ...barolo, tastedOn: '2024-06-01' }, 'pasta', now)).toBe('Firm enough for a ragù, and you loved it in 2024.');
  });
});

describe('save for a weekend', () => {
  it('suggests keeping a big red that needs time open', () => {
    const r = rankTonight([rhone, pauillac], 'steak', now);
    expect(r[0].wine.id).toBe('rhone');
    const w = saveForWeekend(r, r[0], 'steak');
    expect(w?.wine.id).toBe('pauillac');
    expect(w?.text).toBe('Your Château Essai Grand Vin needs a couple of hours open. It would suit Saturday’s steak better.');
  });

  it('suggests keeping a better-fitting, pricier bottle you rated higher', () => {
    const r = rankTonight([pinot, rhone], 'pizza', now);
    // The Côtes du Rhône wins pizza; nothing pricier and better fitting is left.
    expect(saveForWeekend(r, r[0], 'pizza')).toBeNull();
    const special = wine({ id: 'sp', name: 'Gran Selezione', grapes: ['Sangiovese'], style: 'red', rating: 'loved', owned: 1, price: 70 });
    const easy = wine({ id: 'ez', name: 'Everyday Red', grapes: ['Merlot'], style: 'red', rating: 'loved', owned: 1, price: 14 });
    const r2 = rankTonight([special, easy, rhone, albarino], 'pasta', now);
    const pickEasy = r2.find((p) => p.wine.id === 'ez')!;
    expect(saveForWeekend(r2, pickEasy, 'pasta')?.wine.id).toBe('sp');
  });

  it('stays quiet when nothing at home is worth saving', () => {
    const r = rankTonight([albarino, riesling], 'fish', now);
    expect(saveForWeekend(r, r[0], 'fish')).toBeNull();
  });
});
