import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { applyFilters, DEFAULT_FILTERS, matchesQuery, tally } from './filters';

const wines = [
  wine({ producer: 'Ridge', name: 'Lytton Springs', vintage: 2019, country: 'United States', region: 'Dry Creek Valley', grapes: ['Zinfandel', 'Petite Sirah'], style: 'red', price: 45, rating: 'loved', owned: 2 }),
  wine({ producer: 'Domaine Vacheron', name: 'Sancerre', vintage: 2022, country: 'France', region: 'Loire', grapes: ['Sauvignon Blanc'], style: 'white', price: 38, rating: 'liked' }),
  wine({ producer: 'Château Musar', name: 'Rouge', vintage: 2016, country: 'Lebanon', region: 'Bekaa Valley', grapes: ['Cinsault', 'Carignan'], style: 'red', price: 60, rating: 'wouldnt' }),
  wine({ producer: 'Domaine Tempier', name: 'Bandol Rosé', vintage: 2023, country: 'France', region: 'Provence', grapes: ['Mourvèdre'], style: 'rose', price: null, rating: null, owned: 1 }),
  wine({ producer: 'Bollinger', name: 'Special Cuvée', vintage: 'NV', country: 'France', region: 'Champagne', grapes: ['Pinot Noir'], style: 'sparkling', price: 79, rating: 'loved' }),
];

const ids = (ws: { producer: string }[]) => ws.map((w) => w.producer);

describe('matchesQuery', () => {
  it('ignores accents and case', () => {
    expect(matchesQuery(wines[2], 'chateau musar')).toBe(true);
    expect(matchesQuery(wines[3], 'rose mourvedre')).toBe(true);
  });
  it('requires every word, matching word prefixes', () => {
    expect(matchesQuery(wines[0], 'ridge zin')).toBe(true);
    expect(matchesQuery(wines[0], 'ridge merlot')).toBe(false);
    expect(matchesQuery(wines[0], 'idge')).toBe(false);
  });
  it('finds vintages including NV', () => {
    expect(matchesQuery(wines[4], 'nv')).toBe(true);
    expect(matchesQuery(wines[1], '2022')).toBe(true);
  });
});

describe('applyFilters', () => {
  it('filters by shelf', () => {
    expect(ids(applyFilters(wines, { ...DEFAULT_FILTERS, shelf: 'loved' }))).toEqual(['Bollinger', 'Ridge']);
    expect(ids(applyFilters(wines, { ...DEFAULT_FILTERS, shelf: 'owned' }))).toEqual(['Domaine Tempier', 'Ridge']);
    expect(ids(applyFilters(wines, { ...DEFAULT_FILTERS, shelf: 'untasted' }))).toEqual(['Domaine Tempier']);
  });

  it('combines country, style and price filters', () => {
    const r = applyFilters(wines, { ...DEFAULT_FILTERS, countries: ['france'], styles: ['white', 'sparkling'], priceBands: ['20-40'] });
    expect(ids(r)).toEqual(['Domaine Vacheron']);
  });

  it('treats multiple values within a filter as OR', () => {
    const r = applyFilters(wines, { ...DEFAULT_FILTERS, priceBands: ['u20', '75+'] });
    expect(ids(r)).toEqual(['Bollinger']);
  });

  it('excludes unpriced wines when filtering by price', () => {
    const r = applyFilters(wines, { ...DEFAULT_FILTERS, priceBands: ['u20', '20-40', '40-75', '75+'] });
    expect(r).toHaveLength(4);
  });

  it('sorts by price with unpriced last', () => {
    expect(ids(applyFilters(wines, { ...DEFAULT_FILTERS, sort: 'price-asc' }))).toEqual([
      'Domaine Vacheron', 'Ridge', 'Château Musar', 'Bollinger', 'Domaine Tempier',
    ]);
    expect(ids(applyFilters(wines, { ...DEFAULT_FILTERS, sort: 'price-desc' }))[0]).toBe('Bollinger');
  });

  it('sorts by rating then recency', () => {
    expect(ids(applyFilters(wines, { ...DEFAULT_FILTERS, sort: 'rating' }))).toEqual([
      'Bollinger', 'Ridge', 'Domaine Vacheron', 'Château Musar', 'Domaine Tempier',
    ]);
  });

  it('sorts by vintage with NV last', () => {
    const r = applyFilters(wines, { ...DEFAULT_FILTERS, sort: 'vintage' });
    expect(r.map((w) => w.vintage)).toEqual([2023, 2022, 2019, 2016, 'NV']);
  });
});

describe('tally', () => {
  it('merges case/accent variants and counts', () => {
    expect(tally(['France', 'france', 'Italy', '', 'Côte', 'Cote'])).toEqual([
      { value: 'Côte', count: 2 },
      { value: 'France', count: 2 },
      { value: 'Italy', count: 1 },
    ]);
  });
});
