import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { advise, describeCounts } from './insights';

const history = [
  wine({ producer: 'Ridge', name: 'Lytton Springs', grapes: ['Zinfandel'], region: 'Dry Creek Valley', country: 'United States', style: 'red', rating: 'loved', price: 45 }),
  wine({ producer: 'Ridge', name: 'Geyserville', grapes: ['Zinfandel'], region: 'Alexander Valley', country: 'United States', style: 'red', rating: 'loved', price: 42 }),
  wine({ producer: 'Seghesio', name: 'Old Vine', grapes: ['Zinfandel'], region: 'Sonoma County', country: 'United States', style: 'red', rating: 'liked', price: 35 }),
  wine({ producer: 'Bogle', name: 'Old Vine Zinfandel', grapes: ['Zinfandel'], region: 'California', country: 'United States', style: 'red', rating: 'wouldnt', price: 12 }),
  wine({ producer: 'Kim Crawford', name: 'Sauvignon Blanc', grapes: ['Sauvignon Blanc'], region: 'Marlborough', country: 'New Zealand', style: 'white', rating: 'wouldnt', price: 15 }),
  wine({ producer: 'Cloudy Bay', name: 'Sauvignon Blanc', grapes: ['Sauvignon Blanc'], region: 'Marlborough', country: 'New Zealand', style: 'white', rating: 'wouldnt', price: 30 }),
  wine({ producer: 'Portugal Co', name: 'Tinto', grapes: [], region: 'Portugal', country: 'Portugal', style: 'red', rating: 'liked' }),
];

describe('advise', () => {
  it('reports a wine already rated as the verdict', () => {
    const a = advise(history, { query: 'Ridge Geyserville 2021' });
    expect(a.exact.map((w) => w.name)).toEqual(['Geyserville']);
    expect(a.verdict.level).toBe('strong');
    expect(a.verdict.title).toMatch(/loved this one/);
  });

  it('warns about a wine you said you would not buy again', () => {
    const a = advise(history, { query: 'cloudy bay sauvignon blanc' });
    expect(a.exact.map((w) => w.producer)).toEqual(['Cloudy Bay']);
    expect(a.verdict.title).toMatch(/wouldn’t buy it again/);
  });

  it('treats a loose match as related, not the same wine', () => {
    const a = advise(history, { query: 'ridge zin' });
    expect(a.exact).toEqual([]);
    expect(a.related.map((w) => w.name)).toEqual(['Lytton Springs', 'Geyserville']);
    expect(a.verdict.title).toBe('Strong match');
  });

  it('ignores generic words in producer names', () => {
    const wines = [wine({ producer: 'Ridge Vineyards', name: 'Monte Bello', rating: 'loved' })];
    expect(advise(wines, { query: 'ridge' }).signals.map((s) => s.value)).toEqual(['Ridge Vineyards']);
    expect(advise(wines, { query: 'vineyards' }).signals).toEqual([]);
  });

  it('reasons from producer and grape for a bottle you have not had', () => {
    const a = advise(history, { query: 'Ridge East Bench Zinfandel 2021' });
    expect(a.exact).toEqual([]);
    expect(a.signals.map((s) => `${s.kind}:${s.value}`)).toEqual(['producer:Ridge', 'grape:Zinfandel']);
    expect(a.signals[0].counts).toMatchObject({ loved: 2 });
    expect(a.verdict.level).toBe('strong');
  });

  it('flags a region you dislike', () => {
    const a = advise(history, { query: 'Marlborough sauv blanc' });
    expect(a.exact).toEqual([]);
    expect(a.signals.find((s) => s.kind === 'region')?.value).toBe('Marlborough');
    expect(a.signals.find((s) => s.kind === 'grape')?.value).toBe('Sauvignon Blanc');
    expect(a.verdict.level).toBe('skip');
  });

  it('detects style words in the query', () => {
    const a = advise(history, { query: 'some champagne' });
    expect(a.signals).toEqual([]);
    expect(a.verdict.level).toBe('unknown');
    const b = advise(history, { query: 'unknown red' });
    expect(b.signals.map((s) => s.kind)).toEqual(['style']);
  });

  it('has no opinion with no history', () => {
    const a = advise(history, { query: 'Gramercy Cellars Syrah' });
    expect(a.verdict.level).toBe('unknown');
  });

  it('does not repeat a region that only names the country', () => {
    const a = advise(history, { query: 'Portugal' });
    expect(a.signals.map((s) => s.kind)).toEqual(['country']);
  });

  it('compares the shelf price to what you pay for wines you love', () => {
    expect(advise(history, { query: 'zinfandel', price: 90 }).price?.note).toMatch(/well above/);
    expect(advise(history, { query: 'zinfandel', price: 40 }).price?.note).toMatch(/Right around/);
  });

  it('describes counts', () => {
    expect(describeCounts({ loved: 2, liked: 0, wouldnt: 1, untasted: 0 })).toBe('2 loved · 1 wouldn’t buy again');
  });
});
