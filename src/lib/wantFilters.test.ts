import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../db';
import type { Wine } from '../types';
import { filterWant, NO_FILTERS, wantCountries } from './wantFilters';

let n = 0;
const wine = (over: Partial<Wine>): Wine => ({ ...emptyDraft(), id: `w${n++}`, createdAt: n, updatedAt: n, ...over });
const wish = (priceMin: number) => ({ collection: 'Great Wines', tier: 'Prestige', priceMin, priceMax: null, openEnded: false, priority: null });

describe('Want to try filters', () => {
  const barolo = wine({ country: 'Italy', style: 'red', wish: wish(80) });
  const chablis = wine({ country: 'France', style: 'white', price: 45 });
  const cab = wine({ country: 'United States', style: 'red', price: null });
  const fizz = wine({ country: 'France', style: 'sparkling', wish: wish(250) });
  const all = [barolo, chablis, cab, fizz];

  it('filters by country, price band and colour, using a wishlist’s low price', () => {
    expect(filterWant(all, NO_FILTERS)).toHaveLength(4);
    expect(filterWant(all, { ...NO_FILTERS, country: 'France' })).toEqual([chablis, fizz]);
    expect(filterWant(all, { ...NO_FILTERS, price: '50-100' })).toEqual([barolo]);
    expect(filterWant(all, { ...NO_FILTERS, price: 'u50' })).toEqual([chablis]);
    expect(filterWant(all, { ...NO_FILTERS, price: '200+' })).toEqual([fizz]);
    expect(filterWant(all, { ...NO_FILTERS, colour: 'other' })).toEqual([fizz]);
    expect(filterWant(all, { country: 'France', price: 'any', colour: 'red' })).toEqual([]);
  });

  it('lists the countries with the most bottles first', () => {
    expect(wantCountries(all)).toEqual(['France', 'Italy', 'United States']);
  });
});
