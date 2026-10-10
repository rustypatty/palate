import { describe, expect, it } from 'vitest';
import { catalogForShelfBottle, catalogLookup, cleanGrapes, type CatalogDeps } from './catalog';
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
