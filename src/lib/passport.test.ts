import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { buildPassport, homesOf } from './passport';

const cdp = wine({ producer: 'Domaine Essai', name: 'Châteauneuf-du-Pape', region: 'Châteauneuf-du-Pape', country: 'France', grapes: ['Grenache', 'Syrah'], style: 'red', rating: 'loved' });
const cdp2 = wine({ producer: 'Clos Exemple', name: 'Châteauneuf-du-Pape Réserve', region: 'Châteauneuf-du-Pape', country: 'France', grapes: ['Grenache'], rating: 'liked' });
const rioja = wine({ producer: 'Bodega Prueba', name: 'Reserva', region: 'Rioja', country: 'Spain', grapes: ['Tempranillo'], rating: 'loved' });
const texas = wine({ producer: 'Hill Cellars', name: 'Red', region: 'Texas Hill Country', country: 'United States', grapes: ['Tempranillo'], rating: 'wouldnt' });
const notTasted = wine({ producer: 'Someday', name: 'Barolo', region: 'Barolo', grapes: ['Nebbiolo'], owned: 1 });
const want = wine({ producer: 'Later', name: 'Barbaresco', region: 'Barbaresco', grapes: ['Nebbiolo'], list: 'want', rating: 'loved' });
const noGrapes = wine({ producer: 'Château Probe', name: 'Pauillac', region: 'Pauillac', rating: 'liked' });

const p = buildPassport([cdp, cdp2, rioja, texas, notTasted, want, noGrapes]);

describe('wine passport', () => {
  it('counts only bottles you have tasted (rated), not Want to try or untasted ones', () => {
    expect(p.tasted).toBe(5);
    expect(p.grapes.map((g) => g.name)).not.toContain('Nebbiolo');
  });

  it('groups places by area, loved first, with the appellations inside', () => {
    expect(p.places.map((x) => [x.name, x.tried, x.loved])).toEqual([
      // Equal loves: more bottles tasted first.
      ['Southern Rhône', 2, 1],
      ['Rioja', 1, 1],
      ['Bordeaux', 1, 0],
      ['Texas Hill Country', 1, 0],
    ]);
    const rhone = p.places.find((x) => x.name === 'Southern Rhône')!;
    expect(rhone.stamps).toMatchObject([{ name: 'Châteauneuf-du-Pape', tried: 2, loved: 1 }]);
    expect(rhone.notYet).toContain('Gigondas');
    expect(rhone.notYet).not.toContain('Châteauneuf-du-Pape');
    expect(p.countries).toEqual(['France', 'Spain', 'United States']);
  });

  it('uses the appellation’s usual grapes when a bottle has none written', () => {
    expect(p.grapes.find((g) => g.name === 'Cabernet Sauvignon')).toMatchObject({ tried: 1, loved: 0 });
  });

  it('suggests neighbours of a place you loved, preferring ones made from the grapes you loved', () => {
    const n = p.next.find((x) => x.kind === 'neighbour' && x.title === 'More of Southern Rhône')!;
    expect(n.why).toContain('You loved Châteauneuf-du-Pape');
    // Gigondas and Vacqueyras are Grenache; Tavel (rosé) is too, but Grenache reds come first in the guide.
    expect(n.tryThese).toEqual(['Gigondas', 'Vacqueyras', 'Rasteau']);
  });

  it('suggests a loved grape from a place you have never been', () => {
    const g = p.next.find((x) => x.kind === 'grape' && x.title.startsWith('Grenache'));
    // Not Provence: that's a rosé region, and the Grenache you loved was red.
    expect(g).toMatchObject({ title: 'Grenache from Languedoc', tryThese: ['Languedoc'] });
  });

  it('suggests classic grapes you have not met, with where they are most typical', () => {
    expect(p.classicsNotYet).toContain('Pinot Noir');
    expect(p.classicsNotYet).not.toContain('Grenache');
    // Nebbiolo first: there's an untasted Barolo on hand to start with.
    expect(p.next.filter((x) => x.kind === 'classic')).toMatchObject([
      { title: 'Meet Nebbiolo', tryThese: ['Barolo', 'Barbaresco', 'Gattinara'], waiting: [notTasted] },
      { title: 'Meet Pinot Noir', tryThese: ['Gevrey-Chambertin', 'Nuits-Saint-Georges', 'Vosne-Romanée'], waiting: [] },
    ]);
  });

  it('points you to a bottle you already have that fits, before buying anything', () => {
    const pf = wine({ producer: 'Maison Test', name: 'Pouilly-Fuissé', region: 'Pouilly-Fuissé', grapes: ['Chardonnay'], style: 'white', owned: 1 });
    const crozes = wine({ producer: 'Domaine Probe', name: 'Crozes-Hermitage', region: 'Crozes-Hermitage', grapes: ['Syrah'], list: 'want' });
    const q = buildPassport([cdp, cdp2, rioja, pf, crozes]);
    expect(q.next.find((x) => x.title === 'Meet Chardonnay')?.waiting).toEqual([pf]);
    // Any Chardonnay counts for meeting the grape, not only Burgundy.
    const napa = wine({ producer: 'Valley Test', name: 'Chardonnay', region: 'Napa Valley', grapes: ['Chardonnay'], style: 'white', owned: 1 });
    expect(buildPassport([cdp, rioja, napa]).next.find((x) => x.title === 'Meet Chardonnay')?.waiting).toEqual([napa]);
    expect(q.next.find((x) => x.title === 'Syrah from Northern Rhône')).toMatchObject({ tryThese: ['Crozes-Hermitage', 'Saint-Joseph', 'Cornas'], waiting: [crozes] });
  });

  it('knows where a grape is at home', () => {
    expect(homesOf('Syrah').map((h) => h.area)).toEqual(['Northern Rhône', 'South Australia']);
    expect(homesOf('Syrah')[0].names).toContain('Crozes-Hermitage');
  });

  it('is empty, not broken, with nothing tasted', () => {
    expect(buildPassport([notTasted, want])).toMatchObject({ tasted: 0, places: [], grapes: [], next: expect.any(Array) });
  });
});
