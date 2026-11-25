import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import type { Rating, Wine } from '../types';
import { buildDashboard, countryOptions, EMPTY_FILTER, median, MIN, weekStart } from './dashboard';

// Monday 23 Nov 2026.
const NOW = new Date(2026, 10, 23, 10);
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

function many(n: number, partial: Partial<Wine>, ratings: Rating[]): Wine[] {
  return Array.from({ length: n }, (_, i) => wine({ ...partial, rating: ratings[i % ratings.length] }));
}

/** 12 French Pinots (8 loved, 4 liked) and 10 Italian Sangioveses (3 loved, 7 liked), all added on Tue 10 Nov and tasted on Sat 14 Nov. */
function cellar(): Wine[] {
  const base = { createdAt: at(2026, 11, 10), tastedOn: '2026-11-14', style: 'red' as const };
  const french = [
    ...many(8, { ...base, country: 'France', grapes: ['Pinot Noir'], price: 60 }, ['loved']),
    ...many(4, { ...base, country: 'France', grapes: ['Pinot Noir'], price: 60 }, ['liked']),
  ];
  const italian = [
    ...many(3, { ...base, country: 'Italy', grapes: ['Sangiovese'], price: 20 }, ['loved']),
    ...many(7, { ...base, country: 'Italy', grapes: ['Sangiovese'], price: 20 }, ['liked']),
  ];
  return [...french, ...italian];
}

describe('weekStart', () => {
  it('is the Monday of that week', () => {
    expect(weekStart(new Date(2026, 10, 14, 15)).getDate()).toBe(9); // Saturday → Monday 9 Nov
    expect(weekStart(new Date(2026, 10, 15, 15)).getDate()).toBe(9); // Sunday belongs to the week before
    expect(weekStart(new Date(2026, 10, 16, 0, 5)).getDate()).toBe(16);
  });
});

describe('median', () => {
  it('handles empty, odd and even lists', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('buildDashboard', () => {
  it('counts the headline numbers', () => {
    // Wines made by the fixture have no real dates, so look at all time.
    const d = buildDashboard([...cellar(), wine({ owned: 2 }), wine({ owned: 3, rating: 'wouldnt' })], { ...EMPTY_FILTER, range: 'all' }, NOW);
    expect(d.kpis.wines).toBe(24);
    expect(d.kpis.tasted).toBe(22);
    expect(d.kpis.rated).toBe(23);
    expect(d.kpis.loved).toBe(11);
    expect(d.kpis.lovedRate).toBeCloseTo(11 / 23);
    expect(d.kpis.bottles).toBe(5);
    expect(d.kpis.priced).toBe(22);
    expect(d.kpis.medianPaid).toBe(60);
  });

  it('has no rate and no median with nothing rated or priced', () => {
    const d = buildDashboard([wine({}), wine({})], EMPTY_FILTER, NOW);
    expect(d.kpis.lovedRate).toBeNull();
    expect(d.kpis.medianPaid).toBeNull();
    expect(d.grapes).toEqual([]);
    expect(d.highlights).toEqual([]);
    expect(d.weekdays).toBeNull();
  });

  it('draws weeks up to the last full week while this week has nothing yet', () => {
    const d = buildDashboard(cellar(), EMPTY_FILTER, NOW);
    expect(d.weeks).toHaveLength(8);
    expect(d.weeks[0].start).toBe('2026-09-28');
    expect(d.weeks[7].start).toBe('2026-11-16');
    expect(d.weeks.every((w) => !w.partial)).toBe(true);
    const nov9 = d.weeks.find((w) => w.start === '2026-11-09')!;
    expect(nov9.added).toBe(22);
    expect(nov9.tasted).toBe(22);
  });

  it('includes this week, marked partial, once it has activity', () => {
    const d = buildDashboard([...cellar(), wine({ createdAt: at(2026, 11, 23) })], EMPTY_FILTER, NOW);
    const last = d.weeks[d.weeks.length - 1];
    expect(last.start).toBe('2026-11-23');
    expect(last.partial).toBe(true);
    // Changes still compare full weeks only: the last full week against the one before.
    expect(d.change.addedLast).toBe(0);
    expect(d.change.added).toBe(-1);
  });

  it('compares the last full week with the week before', () => {
    const wines = [
      ...Array.from({ length: 4 }, () => wine({ createdAt: at(2026, 11, 10) })),
      ...Array.from({ length: 6 }, () => wine({ createdAt: at(2026, 11, 17) })),
    ];
    const d = buildDashboard(wines, EMPTY_FILTER, NOW);
    expect(d.change.addedLast).toBe(6);
    expect(d.change.added).toBeCloseTo(0.5);
    expect(d.change.tasted).toBeNull(); // nothing tasted the week before: no baseline
  });

  it('notices a week that holds most of the tastings', () => {
    const d = buildDashboard(cellar(), EMPTY_FILTER, NOW);
    expect(d.peak).toMatchObject({ label: 'Nov 9', tasted: 22 });
    expect(d.peak!.share).toBe(1);
  });

  it('shows tastings by weekday only after enough dated tastings', () => {
    expect(buildDashboard(cellar().slice(0, MIN.weekdayTastings - 1), EMPTY_FILTER, NOW).weekdays).toBeNull();
    const d = buildDashboard(cellar(), EMPTY_FILTER, NOW);
    expect(d.weekdays).toMatchObject({ total: 22, top: 5 }); // Saturday
    expect(d.weekdays!.counts[5]).toBe(22);
  });

  it('ranks grapes by loved rate and hides those with too few ratings', () => {
    const wines = [...cellar(), ...many(3, { country: 'Austria', grapes: ['Grüner Veltliner'], style: 'white' }, ['loved'])];
    const d = buildDashboard(wines, { ...EMPTY_FILTER, range: 'all' }, NOW);
    expect(d.grapes.map((g) => g.label)).toEqual(['Pinot Noir', 'Sangiovese']);
    expect(d.grapes[0]).toMatchObject({ wines: 12, rated: 12, loved: 8 });
    expect(d.grapes[0].rate).toBeCloseTo(8 / 12);
    expect(d.grapesPending).toBe(1);
  });

  it('reports a loved rate per country, best first', () => {
    const d = buildDashboard(cellar(), EMPTY_FILTER, NOW);
    expect(d.countries.map((c) => [c.label, c.loved, c.rated])).toEqual([
      ['France', 8, 12],
      ['Italy', 3, 10],
    ]);
  });

  it('lists a country only from three ratings, and puts early reads after the well-rated ones', () => {
    const wines = [
      ...cellar(), // France 12 rated, Italy 10 rated
      ...many(4, { country: 'Spain', createdAt: at(2026, 11, 10) }, ['loved']), // 100%, but only 4 ratings
      ...many(2, { country: 'Austria', createdAt: at(2026, 11, 10) }, ['loved']), // too few to list
    ];
    const d = buildDashboard(wines, EMPTY_FILTER, NOW);
    expect(d.countries.map((c) => c.label)).toEqual(['France', 'Italy', 'Spain']);
  });

  it('puts rated, priced wines into price bands', () => {
    const d = buildDashboard(cellar(), EMPTY_FILTER, NOW);
    expect(d.pricedRated).toBe(22);
    const by = Object.fromEntries(d.prices.map((p) => [p.key, p]));
    expect(by['u25']).toMatchObject({ rated: 10, loved: 3 });
    expect(by['50-100']).toMatchObject({ rated: 12, loved: 8 });
    expect(by['25-50'].rated).toBe(0);
  });

  it('scopes every number to the style and country filters', () => {
    const wines = [...cellar(), ...many(4, { country: 'France', style: 'white', createdAt: at(2026, 11, 10) }, ['loved'])];
    const reds = buildDashboard(wines, { ...EMPTY_FILTER, style: 'red' }, NOW);
    expect(reds.kpis.wines).toBe(22);
    const italy = buildDashboard(wines, { ...EMPTY_FILTER, country: 'Italy' }, NOW);
    expect(italy.kpis.wines).toBe(10);
    expect(italy.countries.map((c) => c.label)).toEqual(['Italy']);
    expect(italy.weeks.find((w) => w.start === '2026-11-09')!.added).toBe(10);
  });

  it('scopes the cards to the range but keeps older wines under all time', () => {
    const old = wine({ createdAt: at(2026, 1, 5), rating: 'loved' });
    const wines = [...cellar(), old];
    expect(buildDashboard(wines, { ...EMPTY_FILTER, range: '8w' }, NOW).kpis.wines).toBe(22);
    const all = buildDashboard(wines, { ...EMPTY_FILTER, range: 'all' }, NOW);
    expect(all.kpis.wines).toBe(23);
    expect(all.weeks).toHaveLength(26); // capped
  });

  it('files bottles on hand by their drink window', () => {
    const win = (from: number, to: number) => ({ from, to, source: 'claude' as const, vintage: 2023 });
    const wines = [
      wine({ owned: 2, vintage: 2023, drinkWindow: win(2026, 2031) }), // ready
      wine({ owned: 1, vintage: 2023, drinkWindow: win(2024, 2027) }), // drink soon
      wine({ owned: 3, vintage: 2023, drinkWindow: win(2028, 2035) }), // too young
      wine({ owned: 1, vintage: 2023, drinkWindow: win(2018, 2025) }), // past
      wine({ owned: 4, vintage: 2023 }), // no window
      wine({ owned: 2, vintage: 2019, drinkWindow: win(2026, 2031) }), // window was for another vintage
      wine({ owned: 0, vintage: 2023, drinkWindow: win(2026, 2031) }), // none on hand
    ];
    expect(buildDashboard(wines, { ...EMPTY_FILTER, range: 'all' }, NOW).drink).toEqual({ onHand: 13, ready: 2, soon: 1, early: 3, past: 1, none: 6 });
  });

  it('counts how much of the collection each field covers', () => {
    const d = buildDashboard([...cellar(), wine({}), wine({})], { ...EMPTY_FILTER, range: 'all' }, NOW);
    expect(d.coverage).toEqual([
      { id: 'rating', label: 'Ratings', have: 22, total: 24 },
      { id: 'tasted', label: 'Tasting dates', have: 22, total: 24 },
      { id: 'price', label: 'Prices', have: 22, total: 24 },
    ]);
  });
});

describe('highlights', () => {
  const text = (d: ReturnType<typeof buildDashboard>) => d.highlights.map((h) => h.parts.map((p) => p.t).join(''));

  it('writes what stands out when the numbers differ enough', () => {
    const d = buildDashboard(cellar(), EMPTY_FILTER, NOW);
    expect(d.highlights.map((h) => h.id)).toEqual(['country', 'weekday', 'price', 'grape']);
    expect(text(d)).toEqual([
      'You love 67% of the France wines you’ve rated, but only 30% of Italy.',
      'Saturday is your tasting day: 22 of 22 tastings.',
      'Your best price band is $50–100: you love 8 of 12 rated wines there.',
      'Sangiovese is your weakest grape: you love only 3 of 10 rated.',
    ]);
    expect(d.highlights[0].parts.filter((p) => p.b).map((p) => p.t)).toEqual(['67%', '30%']);
  });

  it('says nothing from thin data', () => {
    const d = buildDashboard(cellar().slice(0, 6), EMPTY_FILTER, NOW);
    expect(d.highlights).toEqual([]);
  });

  it('calls out a weak grape only when it is well below your average', () => {
    const wines = [
      ...many(10, { country: 'France', grapes: ['Pinot Noir'] }, ['loved']),
      ...many(10, { country: 'Italy', grapes: ['Sangiovese'] }, ['liked', 'liked', 'liked', 'loved']),
    ];
    const d = buildDashboard(wines, { ...EMPTY_FILTER, range: 'all' }, NOW);
    const grape = d.highlights.find((h) => h.id === 'grape');
    expect(grape?.parts.map((p) => p.t).join('')).toBe('Sangiovese is your weakest grape: you love only 2 of 10 rated.');
  });
});

describe('countryOptions', () => {
  it('lists countries by how many wines they have', () => {
    expect(countryOptions(cellar().concat(wine({ country: 'Spain' }), wine({ country: ' ' })))).toEqual(['France', 'Italy', 'Spain']);
  });
});
