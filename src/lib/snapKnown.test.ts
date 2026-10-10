// A label snap reuses the photo of the same wine in your collection, so it must match that wine and nothing else.
import { expect, it } from 'vitest';
import { advise } from './insights';
import { readingToQuery } from './labelReader';
import { wine } from '../test/fixtures';
const mine = [
  wine({ id: 'serp', producer: 'Vincent Girardin', name: 'Les Serpentières', vintage: 2017, region: 'Savigny-Les-Beaune Premier Cru', country: 'France', grapes: ['Pinot Noir'] }),
  wine({ id: 'vv', producer: 'Vincent Girardin', name: 'Savigny-Les-Beaune Vieilles Vignes', vintage: 2019, region: 'Savigny-lès-Beaune', country: 'France' }),
  wine({ id: 'rasteau', producer: 'Domaine de Beaurenard', name: 'Rasteau', vintage: 2021, region: 'Rasteau' }),
];
const reading = (producer: string, wine_name: string, vintage: string, region: string) => ({ is_wine_label: true, producer, wine_name, vintage, country: 'France', region, grapes: [], style: 'red' as const, confidence: 'high' as const, uncertain: '' });
const exact = (r: ReturnType<typeof reading>) => advise(mine, { query: readingToQuery(r), style: null, price: null }).exact.map((w) => w.id);
it('recognises a snapped label as a bottle you already have (any vintage), and only that wine', () => {
  expect(exact(reading('Vincent Girardin', 'Savigny-Les-Beaune Premier Cru Les Serpentières', '2017', 'Savigny-Les-Beaune'))).toEqual(['serp']);
  expect(exact(reading('Vincent Girardin', 'Les Serpentières', '2020', 'Savigny-lès-Beaune 1er Cru'))).toEqual(['serp']);
  expect(exact(reading('Vincent Girardin', 'Savigny-lès-Beaune Vieilles Vignes', '2019', 'Savigny-lès-Beaune'))).toEqual(['vv']);
  expect(exact(reading('Domaine de Beaurenard', 'Châteauneuf-du-Pape', '2021', 'Châteauneuf-du-Pape'))).toEqual([]);
});
