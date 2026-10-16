import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../db';
import type { Wine } from '../types';
import { needsPhoto, photoQueue, photoYear, preferVintage, wrongVintage } from './photoFinder';

const wine = (over: Partial<Wine>): Wine => ({ ...emptyDraft(), id: 'w', createdAt: 0, updatedAt: 0, ...over });

describe('photo finder', () => {
  it('looks for a photo when only a camera snap or nothing is there', () => {
    expect(needsPhoto(wine({ producer: 'Lafarge' }))).toBe(true);
    expect(needsPhoto(wine({ producer: 'Lafarge', photo: { kind: 'local', blobId: 'b', source: { name: 'Your photo' } } }))).toBe(true);
    expect(needsPhoto(wine({ producer: 'Lafarge', photo: { kind: 'remote', url: 'https://x/y.jpg', source: { name: 'shop.com' } } }))).toBe(false);
    expect(needsPhoto(wine({}))).toBe(false); // nothing to search for
  });

  it('tries each wine once, again if its name changes or after two weeks', () => {
    const w = wine({ id: 'a', producer: 'Lafarge', name: 'Volnay' });
    const sig = 'lafarge|volnay||';
    expect(photoQueue([w], 1000, {})).toHaveLength(1);
    expect(photoQueue([w], 1000, { a: { at: 900, sig } })).toHaveLength(0);
    expect(photoQueue([{ ...w, name: 'Volnay Clos des Chênes' }], 1000, { a: { at: 900, sig } })).toHaveLength(1);
    expect(photoQueue([w], 900 + 15 * 86_400_000, { a: { at: 900, sig } })).toHaveLength(1);
  });

  it('tries an interrupted search again soon, a real miss only after two weeks', () => {
    const w = wine({ id: 'a', producer: 'Caiarossa', name: 'Caiarossa' });
    const sig = 'caiarossa|caiarossa||';
    const later = 900 + 31 * 60_000;
    expect(photoQueue([w], later, { a: { at: 900, sig, why: 'no connection', soon: true } })).toHaveLength(1);
    expect(photoQueue([w], later, { a: { at: 900, sig, why: 'no photo of this exact wine was found' } })).toHaveLength(0);
  });
  it('reads the vintage a photo is listed as, from its title or file name', () => {
    expect(photoYear({ title: 'Domaine de la Bressande Mercurey 1993' })).toBe(1993);
    expect(photoYear({ title: 'Bressande Mercurey', url: 'https://cdn.example.com/p/bressande_2023.png?v=3' })).toBe(2023);
    expect(photoYear({ title: 'Bressande Mercurey', url: 'https://cdn.example.com/p/12345678.png' })).toBeNull();
    expect(wrongVintage({ title: 'Mercurey 1993' }, 2023)).toBe(true);
    expect(wrongVintage({ title: 'Mercurey 2023' }, 2023)).toBe(false);
    expect(wrongVintage({ title: 'Mercurey' }, 2023)).toBe(false);
    expect(wrongVintage({ title: 'Mercurey 1993' }, 'NV')).toBe(false);
  });

  it('puts the right vintage first, photos that don’t say next, other years last', () => {
    const a = { title: 'Mercurey 1993' };
    const b = { title: 'Mercurey' };
    const c = { title: 'Mercurey 2023' };
    const d = { title: 'Mercurey 2019' };
    expect(preferVintage([a, b, d, c], 2023)).toEqual([c, b, a, d]);
    expect(preferVintage([a, b, c], null)).toEqual([a, b, c]);
  });
});
