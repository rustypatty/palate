import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { askable, knownIds, loadTurns, saveTurns, suggestions, wineLines } from './ask';

const muga = wine({ id: 'muga', producer: 'Bodegas Muga', name: 'Rioja Reserva', vintage: 2019, style: 'red', country: 'Spain', region: 'Rioja', grapes: ['Tempranillo'], price: 28, rating: 'loved', owned: 1, notes: 'Silky,  smooth tannins.\nLovely.', createdAt: 2 });
const petalos = wine({ id: 'petalos', producer: 'Descendientes de J. Palacios', name: 'Pétalos', vintage: 2020, style: 'red', country: 'Spain', region: 'Bierzo', grapes: ['Mencía'], price: 26, rating: 'loved', createdAt: 1 });
const passed = wine({ id: 'nope', producer: 'Passed', name: 'On', list: 'passed', createdAt: 3 });
const want = wine({ id: 'want', producer: 'Someday', name: 'Barolo', list: 'want', createdAt: 4 });

describe('what the chat knows', () => {
  it('lists your wines with ids, oldest first, leaving out the ones you passed on', () => {
    const lines = wineLines([muga, passed, petalos, want]).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\[petalos\] Descendientes de J\. Palacios Pétalos 2020/);
    expect(lines[1]).toBe('[muga] Bodegas Muga Rioja Reserva 2019 | red | Rioja, Spain | Tempranillo | $28 | Loved | 1 at home | notes: "Silky, smooth tannins. Lovely."');
    expect(lines[2]).toContain('on my Want to try list');
  });

  it('keeps only ids of your own wines, once each, in order', () => {
    expect(knownIds(['muga', 'made-up', 'petalos', 'muga', 'nope'], [muga, petalos, passed])).toEqual(['muga', 'petalos']);
    expect(askable([muga, passed]).map((w) => w.id)).toEqual(['muga']);
  });

  it('suggests questions from your own wines', () => {
    const chinon = (id: string) => wine({ id, producer: id, name: 'Chinon', region: 'Chinon', country: 'France', rating: 'loved', style: 'red' });
    const q = suggestions([muga, petalos, chinon('a'), chinon('b'), chinon('c')]);
    expect(q[0]).toBe('What did I love from France?');
    expect(q).toContain('What should I open tonight with steak?');
    expect(q).toContain('Why do I keep loving Chinon?');
    expect(q).toContain('What should I try next?');
    expect(q.length).toBeLessThanOrEqual(5);
  });

  it('keeps the conversation for the session', () => {
    saveTurns([{ q: 'Hi?', a: null, error: 'no connection' }]);
    expect(loadTurns()).toEqual([{ q: 'Hi?', a: null, error: 'no connection' }]);
    saveTurns([]);
    expect(loadTurns()).toEqual([]);
  });
});
