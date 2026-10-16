import { describe, expect, it } from 'vitest';
import { otherSize, photoYear, preferVintage, unsuitable, wrongVintage } from './photoVintage';

// The photo a 2023 Sassicaia really got: the catalog's first image for the wine.
const magnum1993 = {
  title: 'Tenuta San Guido Sassicaia',
  url: 'https://images.weserv.nl/?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2F0020%2F3164%2F8827%2Ffiles%2F1993TenutaSanGuidoSassicaia1.5L.png%3Fv%3D1756935790',
  pageUrl: 'https://www.bottlebarn.com/products/1993-tenuta-san-guido-sassicaia-1-5l',
};
const xtra2023 = {
  title: 'Sassicaia - Tenuta San Guido Bolgheri Sassicaia',
  url: 'https://images.weserv.nl/?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2F0652%2F6789%2F2395%2Ffiles%2Ftenuta-san-guido-bolgheri-sassicaia-2023_60538_2.webp',
  pageUrl: 'https://www.xtrawine.com/products/tenuta-san-guido-bolgheri-sassicaia-2023',
};

describe('photo vintage and size', () => {
  it('reads the year from the title, the real file name behind the relay, or the shop page', () => {
    expect(photoYear({ title: 'Domaine de la Bressande Mercurey 1993' })).toBe(1993);
    expect(photoYear(magnum1993)).toBe(1993);
    expect(photoYear(xtra2023)).toBe(2023);
    expect(photoYear({ url: 'https://cdn.example.com/p/bressande_2023.png?v=3' })).toBe(2023);
    expect(photoYear({ title: 'Bressande', pageUrl: 'https://shop.example.com/products/bressande-mercurey' })).toBeNull();
  });

  it('does not take a year from a folder or an id in the address', () => {
    expect(photoYear({ url: 'https://cdn.shopify.com/s/files/1/0043/2048/3217/files/583cafa9-88ca.jpg?v=1769464320' })).toBeNull();
  });

  it('spots magnums and other sizes', () => {
    expect(otherSize(magnum1993)).toBe(true);
    expect(otherSize(xtra2023)).toBe(false);
    expect(otherSize({ title: 'Sassicaia Magnum 2023' })).toBe(true);
    expect(otherSize({ pageUrl: 'https://shop.example.com/products/sassicaia-375ml-2022' })).toBe(true);
    expect(otherSize({ title: 'Sassicaia 750mL' })).toBe(false);
  });

  it('calls a photo unsuitable when it is another year or a magnum', () => {
    expect(wrongVintage(magnum1993, 2023)).toBe(true);
    expect(wrongVintage({ title: 'Mercurey 2023' }, 2023)).toBe(false);
    expect(wrongVintage({ title: 'Mercurey' }, 2023)).toBe(false);
    expect(wrongVintage({ title: 'Mercurey 1993' }, 'NV')).toBe(false);
    expect(unsuitable(magnum1993, 2023)).toBe(true);
    expect(unsuitable({ title: 'Sassicaia Magnum 2023' }, 2023)).toBe(true);
    expect(unsuitable(xtra2023, 2023)).toBe(false);
  });

  it('puts the right vintage first, photos that don’t say next, other years and magnums last', () => {
    const a = { title: 'Mercurey 1993' };
    const b = { title: 'Mercurey' };
    const c = { title: 'Mercurey 2023' };
    const d = { title: 'Mercurey 2019' };
    expect(preferVintage([a, b, d, c], 2023)).toEqual([c, b, a, d]);
    expect(preferVintage([a, b, c], null)).toEqual([a, b, c]);
    expect(preferVintage([magnum1993, xtra2023], 2023)).toEqual([xtra2023, magnum1993]);
  });
});
