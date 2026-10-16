import { describe, expect, it } from 'vitest';
import { catalogForShelfBottle, catalogLookup, catalogPhotos, cleanGrapes, type CatalogDeps } from './catalog';
import type { CatalogWine } from './catalogMatch';
import type { LabelReading } from './labelReader';

const reading = (producer: string, wine_name: string): LabelReading => ({
  is_wine_label: true,
  producer,
  wine_name,
  vintage: '2019',
  country: '',
  region: '',
  grapes: [],
  style: 'unknown',
  confidence: 'high',
  uncertain: '',
});

const muga: CatalogWine = {
  wine_id: 'wn_1',
  producer: 'Bodegas Muga',
  cuvee: 'Reserva',
  display_name: 'Muga Reserva',
  aliases: ['bodegas muga reserva 2021'],
  country: 'Spain',
  region: 'Rioja',
  appellation: 'Rioja',
  wine_type: 'red',
  grapes: ['Tempranillo', 'Indulge'],
  identity_tier: 'enriched',
  source_count: 2,
  min_usd_750: 24.12,
  min_usd_750_seen_at: null,
  image_url: 'https://cdn.example.com/MugaReserva.png',
  image_width: 720,
  image_height: 1024,
  image_source_page_url: 'https://willowpark.net/products/muga-reserva',
  image_source_domain: 'willowpark.net',
  similarity: 1,
};

const deps = (results: CatalogWine[], bottle = true): CatalogDeps & { searched: string[] } => {
  const searched: string[] = [];
  return { searched, search: async (text) => (searched.push(text), results), isBottle: async () => bottle };
};

describe('catalog lookup after a label snap', () => {
  it('fills colour, grapes, region and a bottle photo from a sure match', async () => {
    const d = deps([muga]);
    const l = await catalogLookup(reading('Bodegas Muga', 'Reserva'), true, undefined, d);
    expect(d.searched).toEqual(['bodegas muga reserva']);
    expect(l).toMatchObject({ style: 'red', grapes: ['Tempranillo'], region: 'Rioja', country: 'Spain', fromCatalog: true });
    expect(l?.photo?.siteName).toBe('willowpark.net');
    expect(l?.photo?.url).toContain('images.weserv.nl'); // relayed, so the app can read and keep it
  });

  it("keeps the catalog's details when its photo is not a clean bottle, with no photo", async () => {
    const l = await catalogLookup(reading('Bodegas Muga', 'Reserva'), true, undefined, deps([muga], false));
    expect(l).toMatchObject({ style: 'red', grapes: ['Tempranillo'], fromCatalog: true, photo: null });
  });

  it("borrows a clean photo from another shop's entry for the same wine", async () => {
    // The best-scoring entry has a phone snapshot; another shop lists the same wine with a bottle shot.
    const snapshot = { ...muga, image_url: 'https://cdn.example.com/IMG_6273.jpg', image_width: 3921, image_height: 3238 };
    const other = { ...muga, wine_id: 'wn_2', display_name: 'Bodegas Muga Reserva Rioja', source_count: 1, similarity: 0.9, image_url: 'https://shop2.example.com/muga.png', image_source_page_url: 'https://shop2.example.com/p/muga', image_source_domain: 'shop2.example.com' };
    const tried: string[] = [];
    const d = { ...deps([snapshot, other]), isBottle: async (url: string) => (tried.push(url), url.includes('muga.png')) };
    const l = await catalogLookup(reading('Bodegas Muga', 'Reserva'), true, undefined, d);
    expect(l?.photo).toMatchObject({ siteName: 'shop2.example.com', pageUrl: 'https://shop2.example.com/p/muga' });
    expect(tried).toHaveLength(2);
    // When no photo is needed, only the wine's own photo is checked.
    tried.length = 0;
    await catalogLookup(reading('Bodegas Muga', 'Reserva'), false, undefined, d);
    expect(tried).toHaveLength(1);
  });

  it('leaves it to the web lookup when the catalog has no sure match', async () => {
    const rouge = { ...muga, wine_id: 'r', producer: 'Domaine Faiveley', cuvee: 'Mercurey Rouge', display_name: 'Faiveley Mercurey Rouge', aliases: [] };
    const blanc = { ...rouge, wine_id: 'b', cuvee: 'Mercurey Blanc', wine_type: 'white' };
    expect(await catalogLookup(reading('Domaine Faiveley', 'Mercurey'), true, undefined, deps([rouge, blanc]))).toBeNull();
    expect(await catalogLookup(reading('Kim Crawford', 'Malbec'), true, undefined, deps([muga]))).toBeNull();
  });

  it('adds details and a photo to a bottle read off a shelf, and nothing when unsure', async () => {
    const b = { producer: 'Bodegas Muga', wine: 'Reserva', vintage: '2021', region: '', country: '', grapes: [], style: 'red' as const, price_usd: 24, deal: '', score: '', where: '', verdict: 'top' as const, taste: [], why: '', price_call: 'unknown' as const, tip: '' };
    expect(await catalogForShelfBottle(b, undefined, deps([muga]))).toMatchObject({ style: 'red', grapes: ['Tempranillo'], region: 'Rioja', photo: { siteName: 'willowpark.net' } });
    expect(await catalogForShelfBottle({ ...b, producer: 'Bodega Inventada', wine: 'Tinto' }, undefined, deps([muga]))).toBeNull();
  });

  it('keeps only real grape names', () => {
    expect(cleanGrapes(['Tempranillo', 'Indulge', "Nero d'Avola", 'Pinot noir', 'Touriga Nacional', 'Bordeaux Blend', ''])).toEqual([
      'Tempranillo',
      "Nero d'Avola",
      'Pinot noir',
      'Touriga Nacional',
    ]);
    expect(cleanGrapes(['Carignan', 'Mourvedre', 'Carignane', 'Mourvèdre', 'Syrah'])).toEqual(['Carignan', 'Mourvedre', 'Syrah']);
  });
});

describe('catalog photos for the photo finder', () => {
  it("uses a sure match's bottle shot as is", async () => {
    const out = await catalogPhotos('Bodegas Muga', 'Reserva', undefined, undefined, deps([muga]));
    expect(out.sure).toMatchObject({ siteName: 'willowpark.net' });
    expect(out.sure?.url).toContain('images.weserv.nl');
    expect(out.sure?.thumbUrl).toContain('w=400');
    expect(out.maybe).toEqual([]);
  });

  it("gives a 2023 bottle the 2023 photo, not the wine's first image, a 1993 magnum", async () => {
    // As with Sassicaia: the matched entry's own image is a 1993 1.5 L; another shop's entry for the wine has the 2023.
    const magnum = { ...muga, image_url: 'https://cdn.example.com/1993MugaReserva1.5L.png', image_source_page_url: 'https://shop1.example.com/products/1993-muga-reserva-1-5l', image_source_domain: 'shop1.example.com' };
    const y2023 = { ...muga, wine_id: 'wn_2', display_name: 'Bodegas Muga Reserva Rioja', source_count: 1, similarity: 0.9, image_url: 'https://cdn.example.com/muga-reserva-2023.png', image_source_page_url: 'https://shop2.example.com/products/muga-reserva-2023', image_source_domain: 'shop2.example.com' };
    const results = [magnum, y2023];
    const right = await catalogPhotos('Bodegas Muga', 'Reserva', undefined, undefined, deps(results), 2023);
    expect(right.sure).toMatchObject({ siteName: 'shop2.example.com', pageUrl: 'https://shop2.example.com/products/muga-reserva-2023' });
    // No vintage known: a magnum still goes last.
    const any = await catalogPhotos('Bodegas Muga', 'Reserva', undefined, undefined, deps(results));
    expect(any.sure).toMatchObject({ siteName: 'shop2.example.com' });
    // Only the magnum to be had: better than nothing.
    const only = await catalogPhotos('Bodegas Muga', 'Reserva', undefined, undefined, deps([magnum]), 2023);
    expect(only.sure).toMatchObject({ siteName: 'shop1.example.com' });
  });

  it("offers the same producer's likely entries when the catalog isn't sure, never another producer's", async () => {
    const entry = (wine_id: string, producer: string, cuvee: string, img: string) => ({
      ...muga,
      wine_id,
      producer,
      cuvee,
      display_name: `${producer} ${cuvee}`,
      aliases: [],
      region: null,
      appellation: null,
      wine_type: 'red',
      grapes: null,
      image_url: `https://cdn.example.com/${img}.png`,
      image_source_domain: 'shop.example.com',
    });
    const results = [
      entry('a', 'Caiarossa', 'Toscane', 'toscane'),
      entry('b', 'Caiarossa', 'Rosso di Toscana IGT', 'rosso'),
      entry('c', 'Caiarossa', 'Aria di Caiarossa', 'aria'),
      entry('d', 'Antinori', 'Tignanello', 'tignanello'),
    ];
    // No clean bottle shot on the best entry (or no sure match): Claude gets to pick.
    const out = await catalogPhotos('Caiarossa', 'Caiarossa', undefined, undefined, deps(results, false));
    expect(out.sure).toBeNull();
    expect(out.maybe.map((p) => p.title)).toEqual(expect.arrayContaining(['Caiarossa Toscane', 'Caiarossa Aria di Caiarossa']));
    expect(out.maybe.some((p) => p.title.includes('Antinori'))).toBe(false);
  });

  it('offers nothing when no entry is from the same producer', async () => {
    const jobard = { ...muga, wine_id: 'j', producer: 'Antoine Jobard', cuvee: "Beaune 1er Cru 'Montrevenots'", display_name: "Antoine Jobard Beaune 1er Cru 'Montrevenots'", aliases: [] };
    const out = await catalogPhotos('Domaine Jean Monnier & Fils', 'Beaune-Montrevenots Premier Cru', undefined, undefined, deps([jobard]));
    expect(out).toEqual({ sure: null, maybe: [] });
  });
});
