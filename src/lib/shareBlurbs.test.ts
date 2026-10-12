import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { byCountry, type ShareBlurb, type SharedWine } from './share';
import { areaOf, blurbsFor, tagFor, type Write } from './shareBlurbs';

// Rusty's shared wines, as they are.
const santenay = wine({ id: 'santenay', producer: 'Benoit Girardin', name: 'Santenay Premier Cru Clos Rousseau', region: 'Santenay', country: 'France', grapes: ['Pinot Noir'], style: 'red' });
const mercurey = wine({ id: 'mercurey', producer: 'Domaine de la Bressande', name: 'Mercurey Premier Cru En Sazenay', region: 'Mercurey', country: 'France', grapes: ['Pinot Noir'], style: 'red' });
const cdp = wine({ id: 'cdp', producer: 'Clos Saint Michel', name: 'Châteauneuf-du-Pape Cuvée Réservée', region: 'Châteauneuf-du-Pape', country: 'France', grapes: ['Grenache', 'Syrah'], style: 'red' });
const rasteau = wine({ id: 'rasteau', producer: 'Domaine de Beaurenard', name: 'Rasteau', region: 'Rasteau', country: 'France', grapes: ['Grenache', 'Syrah', 'Mourvèdre'], style: 'red' });
const pauillac = wine({ id: 'pauillac', producer: 'Château Haut-Bages Libéral', name: 'Pauillac', region: 'Pauillac', country: 'France', grapes: ['Cabernet Sauvignon', 'Merlot'], style: 'red' });
const rioja = wine({ id: 'rioja', producer: 'Sierra Cantabria', name: 'Gran Reserva', region: 'Rioja', country: 'Spain', grapes: ['Tempranillo', 'Graciano'], style: 'red' });
const barolo = wine({ id: 'barolo', producer: 'Renato Ratti', name: 'Barolo Marcenasco', region: 'Barolo', country: 'Italy', grapes: ['Nebbiolo'], style: 'red' });

describe('tags without Claude', () => {
  it('gives each of the shared wines a sensible taste tag from its grapes', () => {
    expect([santenay, mercurey, cdp, rasteau, pauillac, rioja, barolo].map(tagFor)).toEqual([
      'Light & silky',
      'Light & silky',
      'Warm & spicy',
      'Warm & spicy',
      'Bold & rich',
      'Bold & rich',
      'Bold & rich',
    ]);
    expect(tagFor(wine({ style: 'white', grapes: ['Sauvignon Blanc'] }))).toBe('Crisp & fresh');
    expect(tagFor(wine({ style: 'white', grapes: ['Chardonnay'] }))).toBe('Rich & creamy');
    expect(tagFor(wine({ style: 'sparkling' }))).toBe('Bubbly');
  });

  it('names the better-known area, and nothing when the region already is one', () => {
    expect(areaOf(mercurey)).toBe('Burgundy');
    expect(areaOf(rasteau)).toBe('Southern Rhône');
    expect(areaOf(rioja)).toBe('');
  });
});

describe('writing the friendly bits', () => {
  const blurb = (line: string): ShareBlurb => ({ tag: 'Light & silky', line, pairing: 'roast chicken, mushrooms, salmon' });

  it('keeps what was written last time and asks Claude only about new wines, in one request', async () => {
    const asked: string[][] = [];
    const write: Write = async (asks) => {
      asked.push(asks.map((a) => a.name));
      return { ok: true, blurbs: asks.map((a) => blurb(`New: ${a.name}`)) };
    };
    const out = await blurbsFor([santenay, mercurey], { santenay: blurb('Kept') }, write);
    expect(asked).toEqual([['Mercurey Premier Cru En Sazenay']]);
    expect(out.santenay.line).toBe('Kept');
    expect(out.mercurey.line).toBe('New: Mercurey Premier Cru En Sazenay');
  });

  it('falls back to a tag from the grapes when Claude can’t write them', async () => {
    const out = await blurbsFor([cdp], {}, async () => ({ ok: false, reason: 'no key' }));
    expect(out.cdp).toEqual({ tag: 'Warm & spicy', line: '', pairing: '' });
  });
});

describe('grouping by country', () => {
  it('puts the country with the most wines first', () => {
    const s = (id: string, country: string) => ({ id, country }) as SharedWine;
    const groups = byCountry([s('a', 'Spain'), s('b', 'France'), s('c', 'Italy'), s('d', 'France'), s('e', ''), s('f', 'Spain'), s('g', 'France')]);
    expect(groups.map((g) => [g.country, g.wines.length])).toEqual([
      ['France', 3],
      ['Spain', 2],
      ['Italy', 1],
      ['Elsewhere', 1],
    ]);
  });
});
