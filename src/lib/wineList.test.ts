import { describe, expect, it } from 'vitest';
import { cleanSections, draftFromListWine, listAsText, liveAnswer, sectionTitle, withDetails, type ListWine } from './wineList';

const w = (over: Partial<ListWine>): ListWine => ({
  section: 'Burgundy', producer: 'Faiveley', wine: 'Nuits-Saint-Georges Les Montroziers', vintage: '2022', region: 'Nuits-Saint-Georges',
  country: 'France', grapes: ['Pinot Noir'], style: 'red', price: 225, glass_price: 0, ...over,
});

describe('wine list', () => {
  it('numbers the wines under their sections for Claude', () => {
    const text = listAsText([w({}), w({ producer: 'Guillon', wine: 'Marsannay', price: 135 }), w({ section: 'Rhône', producer: 'Guigal', wine: 'Gigondas', vintage: '2019', grapes: [], price: 100, glass_price: 22 })]);
    expect(text).toContain('## Burgundy\n1. Faiveley Nuits-Saint-Georges Les Montroziers 2022 (Nuits-Saint-Georges, France, Pinot Noir, red) — $225 bottle');
    expect(text).toContain('2. Guillon Marsannay 2022');
    expect(text).toContain('## Rhône\n3. Guigal Gigondas 2019 (Nuits-Saint-Georges, France, red) — $100 bottle, $22 glass');
  });

  it('keeps a restaurant price out of the wine’s price', () => {
    const d = draftFromListWine(w({}), 'Firm, dark Pinot', 1, 123);
    expect(d).toMatchObject({ producer: 'Faiveley', vintage: 2022, style: 'red', price: null, store: 'Restaurant' });
    expect(d.suggestion?.key).toBe('list:123:1');
  });
});

describe('overview sections', () => {
  const wines = [w({}), w({ producer: 'Guillon', glass_price: 18 }), w({ producer: 'Guigal' })];
  it('keeps real wines, at most 3 a section, in a fixed order, glass only with a glass price', () => {
    const out = cleanSections(
      [
        { kind: 'glass', picks: [{ n: 1, why: 'no glass price', tag: '' }, { n: 2, why: 'ok', tag: '' }] },
        { kind: 'match', picks: [1, 2, 3, 2, 9].map((n) => ({ n, why: '', tag: '' as const })) },
        { kind: 'new', picks: [] },
      ],
      wines,
    );
    expect(out.map((s) => s.kind)).toEqual(['match', 'glass']);
    expect(out[0].picks.map((p) => p.n)).toEqual([1, 2, 3]);
    expect(out[1].picks.map((p) => p.n)).toEqual([2]);
  });

  it('drops "By the glass" when the list has no glass prices', () => {
    expect(cleanSections([{ kind: 'glass', picks: [{ n: 1, why: '', tag: '' }] }], [w({})])).toEqual([]);
  });

  it('titles the value section with your budget', () => {
    expect(sectionTitle('value', null)).toBe('Best value under $100');
    expect(sectionTitle('value', 80)).toBe('Best value under $80');
  });
});

describe('details for the picks only', () => {
  const read = w({ region: '', country: '', grapes: [], style: 'unknown' });
  it('fills in what the list didn’t print from the pick', () => {
    expect(withDetails(read, { details: { region: 'Barbaresco', country: 'Italy', grapes: ['Nebbiolo'], style: 'red' } })).toMatchObject({
      region: 'Barbaresco',
      country: 'Italy',
      grapes: ['Nebbiolo'],
      style: 'red',
    });
    expect(withDetails(read, {})).toBe(read);
  });
});

describe('answers while they are being written', () => {
  it('shows only complete-enough parts', () => {
    const a = liveAnswer({ reply: 'This list is strong in', sections: [{ kind: 'match', picks: [{ n: 2, why: 'Firm' }, { n: 3 }] }, { kind: 'val' }] });
    expect(a).toEqual({ reply: 'This list is strong in', picks: [], sections: [{ kind: 'match', picks: [{ n: 2, why: 'Firm', tag: '' }] }], tip: '' });
    expect(liveAnswer(null)).toBeNull();
  });
});

describe('reading one line per wine', () => {
  it('splits a line into the wine and its prices', async () => {
    const { lineToWine } = await import('./wineListClient');
    expect(lineToWine('Italian Reds', 'Scarpa | Barbaresco | 2020 | 18 | 85')).toMatchObject({ section: 'Italian Reds', producer: 'Scarpa', wine: 'Barbaresco', vintage: '2020', glass_price: 18, price: 85 });
    expect(lineToWine('Spanish Reds', 'Hacienda Monasterio | Ribera del Duero | 2020 | $19 | ')).toMatchObject({ glass_price: 19, price: 0 });
    expect(lineToWine('x', ' |  | | |')).toBeNull();
  });
});
