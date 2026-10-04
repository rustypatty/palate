// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { makeAdvisor } from './insights';
import { rankCandidates } from './recommend';
import { normalizeUrl, verifyReport } from './storeListClient';
import { parseShopifyProduct, storeById } from './stores';

// Trimmed copies of real Pogo's listings.
const product = (over: Record<string, unknown>) => ({
  id: 1,
  title: 'Failla Pinot Noir Sonoma Coast 2023 (750ml)',
  handle: 'failla-sonoma-coast-pinot-noir-2023-750ml',
  product_type: 'Red',
  tags: ['PWSMigration', 'Red', 'review-92plus'],
  variants: [{ price: '44.99', available: true }],
  images: [{ src: 'https://cdn.shopify.com/s/files/1/0660/8561/7873/files/failla.jpg?v=1776961326' }],
  ...over,
});

describe('reading Pogo’s listings', () => {
  it('turns a listing into a rankable bottle', () => {
    expect(parseShopifyProduct(product({}))).toEqual({
      key: 'pogos:1',
      title: 'Failla Pinot Noir Sonoma Coast 2023',
      style: 'red',
      price: 44.99,
      url: 'https://www.pogoswine.com/products/failla-sonoma-coast-pinot-noir-2023-750ml',
      image: 'https://cdn.shopify.com/s/files/1/0660/8561/7873/files/failla.jpg?v=1776961326&width=480',
      vintage: 2023,
      country: '',
      context: '',
      sizeMl: 750,
    });
  });

  it('reads the country tag, half bottles and NV', () => {
    const p = parseShopifyProduct(product({ title: 'Billecart-Salmon Brut Reserve NV (375ml)', product_type: 'Sparkling', tags: ['French Wine', 'Wine'] }))!;
    expect(p).toMatchObject({ style: 'sparkling', country: 'France', vintage: 'NV', sizeMl: 375 });
    expect(parseShopifyProduct(product({ title: 'Taylor Fladgate 20 Year Tawny (1.5L)', product_type: 'Port' }))).toMatchObject({ style: 'fortified', sizeMl: 1500 });
  });

  it('skips non-wine and sold-out listings', () => {
    expect(parseShopifyProduct(product({ product_type: 'Sake' }))).toBeNull();
    expect(parseShopifyProduct(product({ product_type: 'Non-Alcoholic Wine' }))).toBeNull();
    expect(parseShopifyProduct(product({ variants: [{ price: '20', available: false }] }))).toBeNull();
    expect(parseShopifyProduct(product({ tags: ['Sold Out'] }))).toBeNull();
  });

  it('ranks real-looking listings against your ratings', () => {
    const advisor = makeAdvisor([
      wine({ producer: 'Domaine La Millière', name: 'Châteauneuf-du-Pape', region: 'Châteauneuf-du-Pape', country: 'France', grapes: ['Grenache', 'Syrah'], style: 'red', rating: 'loved' }),
      wine({ producer: 'X', name: 'Gigondas', region: 'Gigondas', country: 'France', style: 'red', rating: 'liked' }),
    ]);
    const items = [
      parseShopifyProduct(product({ id: 2, title: 'Domaine du Pegau Cuvée Réservée Châteauneuf-du-Pape 2021 (750ml)', tags: ['French Wine'] }))!,
      parseShopifyProduct(product({ id: 3, title: 'Rombauer Chardonnay Carneros 2024 (750ml)', product_type: 'White' }))!,
      parseShopifyProduct(product({ id: 4, title: 'Domaine Santa Duc Vacqueyras 2022 (750ml)', tags: ['French Wine'] }))!,
    ];
    const picks = rankCandidates(advisor, items);
    expect(picks.map((p) => p.item.key)).toEqual(['pogos:2', 'pogos:4']);
    expect(picks[1].reason).toMatch(/Southern Rhône/);
  });
});

describe('Claude store lists: only bottles whose page was really found', () => {
  const store = storeById('totalwine');
  const pick = (over: Record<string, unknown>) => ({
    producer: 'Domaine Santa Duc',
    wine: 'Gigondas Les Hauts Garrigues',
    vintage: '2020',
    region: 'Gigondas',
    country: 'France',
    grapes: [],
    style: 'red' as const,
    price_usd: 38.99,
    url: 'https://www.totalwine.com/wine/red-wine/rhone-blend/santa-duc-gigondas/p/123?s=1203',
    reason: 'Like the Châteauneuf-du-Pape you loved',
    ...over,
  });
  const seen = new Set([normalizeUrl('https://www.totalwine.com/wine/red-wine/rhone-blend/santa-duc-gigondas/p/123')]);

  it('keeps a pick whose page appeared in the search results', () => {
    const list = verifyReport({ picks: [pick({})], tips: ['Head to the Rhône aisle'] }, store, seen, null);
    expect(list.picks).toHaveLength(1);
    expect(list.picks[0]).toMatchObject({ title: 'Domaine Santa Duc Gigondas Les Hauts Garrigues 2020', price: 38.99, image: null, vintage: 2020 });
  });

  it('turns an unconfirmed or off-site bottle into a producer tip, never a pick', () => {
    const made_up = pick({ producer: 'Domaine Imaginaire', url: 'https://www.totalwine.com/wine/p/999' });
    const offSite = pick({ producer: 'Château Ailleurs', region: 'Bordeaux', url: 'https://www.wine.com/product/1' });
    const list = verifyReport({ picks: [made_up, offSite], tips: [] }, store, seen, null);
    expect(list.picks).toEqual([]);
    expect(list.tips).toEqual(['Look for Domaine Imaginaire (Gigondas).', 'Look for Château Ailleurs (Bordeaux).']);
  });

  it('drops picks over budget and duplicates', () => {
    expect(verifyReport({ picks: [pick({})], tips: [] }, store, seen, 30).picks).toEqual([]);
    expect(verifyReport({ picks: [pick({}), pick({ url: 'https://totalwine.com/wine/red-wine/rhone-blend/santa-duc-gigondas/p/123/' })], tips: [] }, store, seen, null).picks).toHaveLength(1);
  });
});
