import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import type { NextStep } from './passport';
import { draftFromPath, pathAppellations, pickPath, type CatalogRow } from './paths';

let n = 0;
const row = (producer: string, appellation: string, price: number, extra: Partial<CatalogRow> = {}): CatalogRow => ({
  wine_id: `c${++n}`,
  producer,
  cuvee: `${producer} ${appellation}`,
  display_name: `${producer} ${appellation}`,
  appellation,
  wine_type: 'red',
  grapes: ['Syrah'],
  min_usd_750: price,
  source_count: 10 - (n % 10),
  ...extra,
});

const syrah: NextStep = { kind: 'grape', title: 'Syrah from Northern Rhône', why: '', tryThese: ['Crozes-Hermitage', 'Saint-Joseph', 'Cornas'], waiting: [], area: 'Northern Rhône', grape: 'Syrah', style: 'red' };

describe('learning paths', () => {
  it('looks in the places suggested, then the rest of the area for the same grape and colour', () => {
    expect(pathAppellations(syrah)).toEqual(['Crozes-Hermitage', 'Saint-Joseph', 'Cornas', 'Côte-Rôtie', 'Hermitage']);
    const chardonnay: NextStep = { kind: 'classic', title: 'Meet Chardonnay', why: '', tryThese: ['Chablis'], waiting: [], area: 'Burgundy', grape: 'Chardonnay', style: 'white' };
    expect(pathAppellations(chardonnay)).toContain('Pouilly-Fuissé');
    expect(pathAppellations(chardonnay)).not.toContain('Gevrey-Chambertin');
  });

  it('picks five under $40: one per producer, alternating places, best known first', () => {
    const rows = [
      row('Guigal', 'Crozes-Hermitage', 27, { source_count: 9 }),
      row('Guigal', 'Saint-Joseph', 30, { source_count: 9 }),
      row('Graillot', 'Crozes-Hermitage', 39, { source_count: 11 }),
      row('Perret', 'Saint-Joseph', 38, { source_count: 5 }),
      row('Delas', 'Crozes-Hermitage', 25, { source_count: 5 }),
      row('Chave', 'Saint-Joseph', 39, { source_count: 4 }),
      row('Pricey', 'Cornas', 55, { source_count: 20 }),
    ];
    const path = pickPath(rows, syrah, []);
    expect(path.budget).toBe(40);
    expect(path.bottles.map((b) => [b.producer, b.appellation])).toEqual([
      ['Graillot', 'Crozes-Hermitage'],
      ['Guigal', 'Saint-Joseph'],
      // Guigal's already in, so its Crozes is skipped for the next producer there.
      ['Delas', 'Crozes-Hermitage'],
      ['Perret', 'Saint-Joseph'],
      ['Chave', 'Saint-Joseph'],
    ]);
  });

  it('leaves out the wrong colour or grape, half-price oddities, and producers you already have from there', () => {
    const rows = [
      row('White Guy', 'Crozes-Hermitage', 25, { wine_type: 'white', grapes: ['Marsanne'] }),
      row('Viognier Co', 'Saint-Joseph', 25, { grapes: ['Viognier'] }),
      row('Too Cheap', 'Crozes-Hermitage', 6),
      row('Mine', 'Crozes-Hermitage', 30),
      row('Fine One', 'Crozes-Hermitage', 30),
      row('Fine Two', 'Saint-Joseph', 31),
      row('Fine Three', 'Crozes-Hermitage', 32),
      row('Fine Four', 'Saint-Joseph', 33),
    ];
    const have = wine({ producer: 'Mine', name: 'Crozes-Hermitage', region: 'Crozes-Hermitage', owned: 1 });
    const names = pickPath(rows, syrah, [have]).bottles.map((b) => b.producer);
    expect(names).toEqual(['Fine One', 'Fine Two', 'Fine Three', 'Fine Four']);
  });

  it('goes up to $60 when a place rarely comes under $40, and says so', () => {
    const rows = [row('A', 'Cornas', 52), row('B', 'Cornas', 58), row('C', 'Cornas', 45), row('D', 'Crozes-Hermitage', 38)];
    const path = pickPath(rows, syrah, []);
    expect(path.budget).toBe(60);
    expect(path.bottles).toHaveLength(4);
  });

  it('widens to the rest of the area when only one suggested place has bottles, for contrast', () => {
    const chardonnay: NextStep = { kind: 'classic', title: 'Meet Chardonnay', why: '', tryThese: ['Chablis', 'Meursault'], waiting: [], area: 'Burgundy', grape: 'Chardonnay', style: 'white' };
    const white = { wine_type: 'white', grapes: ['Chardonnay'] };
    const rows = [1, 2, 3, 4, 5].map((i) => row(`Chablis ${i}`, 'Chablis', 25 + i, white)).concat([row('Jadot', 'Pouilly-Fuissé', 15, white), row('Perrusset', 'Mâcon', 19, white)]);
    const places = new Set(pickPath(rows, chardonnay, []).bottles.map((b) => b.appellation));
    expect([...places].sort()).toEqual(['Chablis', 'Mâcon', 'Pouilly-Fuissé']);
  });

  it('saves to Want to try with the producer apart, and which path it came from', () => {
    const graillot = row('Domaine Alain Graillot', 'Crozes-Hermitage', 39.99, { cuvee: 'Crozes Hermitage', display_name: 'Domaine Alain Graillot Crozes Hermitage', source_count: 99 });
    const [b] = pickPath([graillot, row('Y', 'Saint-Joseph', 30), row('Z', 'Crozes-Hermitage', 30)], syrah, []).bottles;
    expect(b).toMatchObject({ producer: 'Domaine Alain Graillot', name: 'Crozes Hermitage', price: 40 });
    const draft = draftFromPath(b, syrah);
    expect(draft).toMatchObject({ producer: 'Domaine Alain Graillot', name: 'Crozes Hermitage', region: 'Crozes-Hermitage', country: 'France', style: 'red', grapes: ['Syrah'], price: null });
    expect(draft.suggestion?.reason).toBe('Learning path: Syrah from Northern Rhône. Usually about $40.');
  });

  it('takes the producer off the front of the wine’s name', () => {
    const guigal = row('E. Guigal', 'Crozes-Hermitage', 27, { cuvee: null, display_name: 'E. Guigal Crozes-Hermitage', source_count: 99 });
    const [b] = pickPath([guigal, row('Q', 'Saint-Joseph', 30), row('R', 'Crozes-Hermitage', 31)], syrah, []).bottles;
    expect(b.name).toBe('Crozes-Hermitage');
  });
});
