import { beforeEach, describe, expect, it } from 'vitest';
import { recentlyShown, rememberShown, shuffled } from './shownPicks';

describe('Bottles shown in recent lists', () => {
  beforeEach(() => localStorage.clear());

  it('remembers them per store, newest first, without repeats', () => {
    rememberShown('pogos', [{ key: 'a', title: 'A Rioja' }, { key: 'b', title: 'B Rioja' }], 1000);
    rememberShown('pogos', [{ key: 'b', title: 'B Rioja' }, { key: 'c', title: 'C Barolo' }], 2000);
    expect(recentlyShown('pogos', 3000).map((p) => p.key)).toEqual(['b', 'c', 'a']);
    expect(recentlyShown('totalwine', 3000)).toEqual([]);
  });

  it('forgets them after two weeks', () => {
    rememberShown('pogos', [{ key: 'a', title: 'A' }], 0);
    expect(recentlyShown('pogos', 15 * 24 * 3600 * 1000)).toEqual([]);
  });

  it('shuffles without losing or adding anything', () => {
    const xs = [1, 2, 3, 4, 5, 6];
    expect([...shuffled(xs)].sort()).toEqual(xs);
    expect(shuffled(xs, () => 0)).not.toEqual(xs);
    expect(xs).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
