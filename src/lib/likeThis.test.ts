// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { bottleAsItem, bottleTitle, isStale, LIKE_REFRESH_MS, normalizeUrl, offerLabel, photoMatches, storeForDomain, verifyBottles, withPogoOffers, type ReportedBottle } from './likeThis';

const TW = 'https://www.totalwine.com/wine/red-wine/rhone-blend/coudoulet/p/111';
const SPECS = 'https://specsonline.com/product/coudoulet-de-beaucastel';
const bottle = (over: Partial<ReportedBottle> = {}): ReportedBottle => ({
  producer: 'Famille Perrin',
  wine: 'Coudoulet de Beaucastel',
  vintage: '2022',
  region: 'Côtes du Rhône',
  country: 'France',
  grapes: [],
  style: 'red',
  offers: [
    { url: `${TW}?s=1203`, price_usd: 34.99 },
    { url: SPECS, price_usd: 32.97 },
  ],
  photo_page_url: '',
  reason: 'Grenache-based like the Châteauneuf you loved',
  ...over,
});
const seen = new Set([normalizeUrl(TW), normalizeUrl(SPECS)]);

describe('bottles like this: one search, many stores', () => {
  it('keeps every store page that was really found, cheapest first, labelled', () => {
    const { bottles } = verifyBottles([bottle()], seen);
    expect(bottles).toHaveLength(1);
    expect(bottles[0].offers.map(offerLabel)).toEqual(['Spec’s $32.97', 'Total Wine $34.99']);
  });

  it('drops offers that weren’t in the search results or aren’t your stores; no offers → a tip', () => {
    const { bottles, tips } = verifyBottles(
      [
        bottle({ offers: [{ url: TW, price_usd: 34.99 }, { url: 'https://www.wine.com/p/1', price_usd: 30 }, { url: 'https://specsonline.com/made-up', price_usd: 20 }] }),
        bottle({ producer: 'Domaine Imaginaire', wine: 'Fantôme', offers: [{ url: 'https://www.totalwine.com/p/999', price_usd: 25 }] }),
      ],
      seen,
    );
    expect(bottles.map((b) => b.offers.map((o) => o.storeId))).toEqual([['totalwine']]);
    expect(tips).toEqual(['Domaine Imaginaire (Côtes du Rhône)']);
  });

  it('merges the same bottle reported twice', () => {
    const { bottles } = verifyBottles([bottle({ offers: [{ url: TW, price_usd: 34.99 }] }), bottle({ offers: [{ url: SPECS, price_usd: 0 }] })], seen);
    expect(bottles).toHaveLength(1);
    expect(bottles[0].offers.map(offerLabel)).toEqual(['Total Wine $34.99', 'Spec’s']);
  });

  it('adds a matching Pogo’s listing as a free extra offer (and its photo)', () => {
    const { bottles } = verifyBottles([bottle()], seen);
    const pogo = [{ key: 'p', title: 'Famille Perrin Coudoulet de Beaucastel Cotes du Rhone Rouge 2023', style: 'red' as const, price: 36.99, url: 'https://www.pogoswine.com/products/x', image: 'https://cdn.shopify.com/x.jpg', vintage: 2023, country: '', sizeMl: 750 }];
    const [b] = withPogoOffers(bottles, pogo);
    expect(b.offers.map(offerLabel)).toEqual(['Spec’s $32.97', 'Total Wine $34.99', 'Pogo’s $36.99']);
    expect(b.image?.siteName).toBe('Pogo’s');
  });

  it('uses Total Wine as the main link and the lowest price for ranking', () => {
    const item = bottleAsItem(verifyBottles([bottle()], seen).bottles[0]);
    expect(item).toMatchObject({ url: `${TW}?s=1203`, price: 32.97, title: 'Famille Perrin Coudoulet de Beaucastel 2022', vintage: 2022 });
  });

  it('only trusts a photo whose page names the same producer and cuvée', () => {
    expect(photoMatches(bottle(), 'Famille Perrin Coudoulet de Beaucastel Rouge 2021 | Wine Shop')).toBe(true);
    expect(photoMatches(bottle(), 'Château de Beaucastel Châteauneuf-du-Pape 2021')).toBe(false);
    expect(photoMatches(bottle(), '')).toBe(false);
  });

  it('knows each store by its website', () => {
    expect(storeForDomain('https://www.centralmarket.com/product/1')).toBe('centralmarket');
    expect(storeForDomain('https://shop.wholefoodsmarket.com/x')).toBe('wholefoods');
    expect(storeForDomain('https://www.heb.com/x')).toBeNull();
  });

  it('refreshes after a month', () => {
    const now = Date.now();
    expect(isStale(wine({}))).toBe(true);
    expect(isStale(wine({ likeThis: { at: now - 1000, bottles: [], tips: [] } }), now)).toBe(false);
    expect(isStale(wine({ likeThis: { at: now - LIKE_REFRESH_MS - 1, bottles: [], tips: [] } }), now)).toBe(true);
  });
});

describe('bottle titles', () => {
  it('doesn’t repeat the producer', () => {
    expect(bottleTitle('Brotte', 'Brotte Chateauneuf du Pape', '2021')).toBe('Brotte Chateauneuf du Pape 2021');
    expect(bottleTitle('E. Guigal', 'Guigal Gigondas', '2020')).toBe('Guigal Gigondas 2020');
    expect(bottleTitle('Famille Perrin', 'Coudoulet de Beaucastel', '2022')).toBe('Famille Perrin Coudoulet de Beaucastel 2022');
    expect(bottleTitle('Domaine X', 'Gigondas 2019', '2019')).toBe('Domaine X Gigondas 2019');
    expect(bottleTitle('Saint Cosme', 'St. Cosme Chateauneuf Du Pape', '')).toBe('St. Cosme Chateauneuf Du Pape');
    expect(bottleTitle('Domaine Charvin', 'Chateauneuf Du Pape', '2021')).toBe('Domaine Charvin Chateauneuf Du Pape 2021');
    // From the Total Wine list's live runs:
    expect(bottleTitle('Homage to Heritage', 'H to H "Homage to Heritage" Chateauneuf du Pape', '')).toBe('H to H "Homage to Heritage" Chateauneuf du Pape');
    expect(bottleTitle('Domaine du Grand Prieur', 'Vacqueyras', '2021')).toBe('Domaine du Grand Prieur Vacqueyras 2021');
    // Only whole words count: "Ridge" is not inside "Partridge Hill".
    expect(bottleTitle('Ridge', 'Partridge Hill Zinfandel', '')).toBe('Ridge Partridge Hill Zinfandel');
  });
});
