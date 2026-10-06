import { describe, expect, it } from 'vitest';
import { draftFromListWine, listAsText, listCost, type ListWine } from './wineList';

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

  it('shows a cost on the read button', () => {
    expect(listCost(3)).toBe('~17¢');
  });
});
