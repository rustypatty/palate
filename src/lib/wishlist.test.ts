import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import type { Wish } from '../types';
import { wishGroups, wishOrder, wishPrice } from './wishlist';

const wish = (over: Partial<Wish>): Wish => ({ collection: 'Great Wines', tier: 'Benchmark', priority: null, priceMin: 50, priceMax: 80, openEnded: false, ...over });

describe('imported wishlists', () => {
  it('puts your priorities first, then the more approachable tiers, then the cheaper bottles', () => {
    const list = [
      wish({ tier: 'Legend', priceMin: 1000 }),
      wish({ tier: 'Icon', priority: 4, priceMin: 300 }),
      wish({ tier: 'Benchmark', priceMin: 60 }),
      wish({ tier: 'Prestige', priority: 1, priceMin: 100 }),
      wish({ tier: 'Benchmark', priceMin: 35 }),
    ];
    expect(list.sort(wishOrder).map((w) => `${w.tier}${w.priority ?? ''}:${w.priceMin}`)).toEqual(['Prestige1:100', 'Icon4:300', 'Benchmark:35', 'Benchmark:60', 'Legend:1000']);
  });

  it('writes the usual price as a range', () => {
    expect(wishPrice(wish({ priceMin: 35, priceMax: 50 }))).toBe('$35–50');
    expect(wishPrice(wish({ priceMin: 1000, priceMax: 2500, openEnded: true }))).toBe('$1,000–2,500+');
    expect(wishPrice(wish({ priceMin: 50000, priceMax: 50000, openEnded: true }))).toBe('$50,000+');
  });

  it('groups only the bottles from a list, by list', () => {
    const a = wine({ id: 'a', list: 'want', wish: wish({ priority: 2 }) });
    const b = wine({ id: 'b', list: 'want', wish: wish({ priority: 1 }) });
    const store = wine({ id: 's', list: 'want' });
    expect(wishGroups([a, store, b]).map(([name, ws]) => [name, ws.map((w) => w.id)])).toEqual([['Great Wines', ['b', 'a']]]);
  });
});
