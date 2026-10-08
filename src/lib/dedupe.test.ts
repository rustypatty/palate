import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { combine, findDuplicates, isSameBottle } from './dedupe';

const byHand = wine({ id: 'a', producer: 'Domaine Exemple', name: 'En Sazenay', vintage: 2022, region: 'Mercurey', rating: 'loved', notes: 'Bright cherry.', createdAt: 1 });
const imported = wine({ id: 'b', producer: 'Domaine Exemple', name: 'Mercurey Premier Cru En Sazenay', vintage: 2022, owned: 1, tastedOn: '2026-03-01', createdAt: 2 });

describe('the same bottle saved twice', () => {
  it('is found when the longer name only adds the appellation and level', () => {
    expect(isSameBottle(byHand, imported)).toBe(true);
  });

  it('is found from a shared photo with the same producer and vintage', () => {
    const photo = { kind: 'remote' as const, url: 'https://x/les-franches.jpg' };
    const a = wine({ producer: 'Domaine Essai', name: 'Pouilly-Fumé', vintage: 2023, photo });
    const b = wine({ producer: 'Domaine Essai', name: 'Les Franches', vintage: 2023, photo });
    expect(isSameBottle(a, b)).toBe(true);
  });

  it('keeps different cuvées, vintages, producers and lists apart', () => {
    const classic = wine({ producer: 'Cascina Prova', name: 'Barolo', vintage: 2019 });
    const cru = wine({ producer: 'Cascina Prova', name: 'Barolo Marcenasco', vintage: 2019 });
    expect(isSameBottle(classic, cru)).toBe(false);
    expect(isSameBottle(byHand, { ...imported, vintage: 2021 })).toBe(false);
    expect(isSameBottle(byHand, { ...imported, producer: 'Another House' })).toBe(false);
    expect(isSameBottle(byHand, { ...imported, list: 'want' })).toBe(false);
    expect(isSameBottle(wine({ name: 'Barolo', vintage: 2019 }), wine({ name: 'Barolo', vintage: 2019 }))).toBe(false);
  });
});

describe('combining them', () => {
  it('keeps the record with your rating and notes, and everything from both', () => {
    const [[keep, drop]] = findDuplicates([imported, byHand]);
    expect(keep.id).toBe('a');
    expect(drop.id).toBe('b');
    expect(combine(keep, drop)).toMatchObject({
      name: 'Mercurey Premier Cru En Sazenay',
      rating: 'loved',
      notes: 'Bright cherry.',
      owned: 1,
      tastedOn: '2026-03-01',
    });
  });

  it('keeps the stronger rating and both sets of notes', () => {
    const a = wine({ rating: 'liked', notes: 'Good.' });
    const b = wine({ rating: 'loved', notes: 'Great with lamb.' });
    expect(combine(a, b)).toMatchObject({ rating: 'loved', notes: 'Good.\n\nGreat with lamb.' });
  });

  it('pairs each wine only once', () => {
    const third = { ...imported, id: 'c' };
    expect(findDuplicates([byHand, imported, third])).toHaveLength(1);
  });
});
