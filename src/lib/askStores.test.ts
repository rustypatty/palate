import { describe, expect, it } from 'vitest';
import { priceCap, searchStock, shopRows, stockBlock, type StoreStock } from './askStores';
import type { StoreItem } from './stores';

const item = (key: string, title: string, over: Partial<StoreItem> = {}): StoreItem => ({
  key,
  title,
  style: 'red',
  price: 30,
  url: `https://example.com/${key}`,
  image: null,
  vintage: 2020,
  country: 'Italy',
  context: 'Italy',
  sizeMl: 750,
  ...over,
});

const pogos: StoreStock = {
  store: 'pogos',
  name: 'Pogo’s',
  at: Date.UTC(2026, 9, 12),
  bottles: [
    item('p1', 'Produttori del Barbaresco Nebbiolo Langhe 2022', { price: 28 }),
    item('p2', 'La Rioja Alta Viña Alberdi Rioja Crianza 2019', { country: 'Spain', context: 'Spain', price: 22 }),
    item('p3', 'Domaine X Sancerre 2023', { style: 'white', country: 'France', context: 'France', price: 31 }),
    item('p4', 'Giacomo Conterno Barolo Cascina Francia 2018', { price: 340 }),
  ],
};
const tw: StoreStock = {
  store: 'totalwine',
  name: 'Total Wine (Las Colinas)',
  at: Date.UTC(2026, 9, 9),
  bottles: [item('t1', 'Marchesi di Barolo Barolo Tradizione 2019', { price: 39 }), item('t2', 'Muga Rioja Reserva 2018', { country: 'Spain', context: 'Spain', price: 27 })],
};

describe('Asking the chat about store bottles', () => {
  it('finds bottles by name, region or grape in both stores', () => {
    const hits = searchStock('What Rioja do you have?', [], [pogos, tw]);
    expect(hits.map((h) => h.item.key).sort()).toEqual(['p2', 't2']);
    expect(hits.map((h) => h.id)).toEqual(['S1', 'S2']);
  });

  it('keeps to the price asked for and the colour', () => {
    expect(priceCap('Barolo under $50 at Total Wine')).toBe(50);
    expect(searchStock('Barolo under $50', [], [pogos, tw]).map((h) => h.item.key)).toEqual(['t1']);
    expect(searchStock('a white from France', [], [pogos, tw]).map((h) => h.item.key)).toEqual(['p3']);
  });

  it('uses the question before for a follow-up', () => {
    const hits = searchStock('and anything cheaper?', ['Any Rioja at Pogo’s?'], [pogos, tw]);
    expect(hits.map((h) => h.item.key).sort()).toEqual(['p2', 't2']);
  });

  it('falls back to the best-reviewed bottles when there is nothing to match on', () => {
    expect(searchStock('what should I try next?', [], [pogos, tw]).length).toBeGreaterThan(0);
  });

  it('tells Claude what is and is not saved', () => {
    expect(stockBlock([], [])).toContain('none');
    const hits = searchStock('Rioja', [], [pogos, tw]);
    const text = stockBlock([pogos, tw], hits);
    expect(text).toContain('Pogo’s (4 bottles');
    expect(text).toContain('S1 | ');
    expect(stockBlock([pogos], [])).toContain('None of their bottles matched');
  });

  it('shows only bottles that were really sent, once each, in the answer’s order', () => {
    const hits = searchStock('Rioja', [], [pogos, tw]);
    const rows = shopRows(['S2', 'S9', 's2', 'S1'], hits);
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe(hits[1].item.title);
    expect(rows[1].url).toBe(hits[0].item.url);
  });
});
