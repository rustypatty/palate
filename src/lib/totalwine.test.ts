// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkImport, mapProduct, pickupStatus, sizeMl, splitVintage, styleFromUrl, type TwProduct } from '../../supabase/functions/_shared/totalwine';
import { wine } from '../test/fixtures';
import { makeAdvisor } from './insights';
import { stockLine, stockList } from './storeListClient';
import { shortlist, stockBottle, type StockRow } from './twStock';

// Trimmed copies of real products from window.INITIAL_STATE on Total Wine's Italian reds page (Las Colinas, 2026-10-09).
const renieri: TwProduct = {
  id: '113709750',
  name: 'Tenuta di Renieri Chianti Classico, 2023',
  brand: { name: 'Tenuta di Renieri' },
  productUrl: '/wine/red-wine/sangiovese/tenuta-di-renieri-chianti-classico/p/113709750',
  packageDescription: '750ml Bottle',
  categories: [
    { name: 'Tuscany', type: 'REGION' },
    { name: 'Sangiovese', type: 'VARIETAL_TYPE' },
  ],
  price: [{ price: 21.99, type: 'EDLP' }],
  promoBadges: [{ badgeSubType: 'MIXCASE6', badgePromotionDescription: 'Mix 6 for $19.79 each' }],
  customerAverageRating: 4.3,
  customerReviewsCount: 387,
  rating: 92,
  ratingSource: 'James Suckling',
  storeId: '535',
  storeName: 'Irving',
  location: 'Aisle 11, Left',
  stockLevel: [{ purchaseLimit: 6, stock: 35 }],
  stockMessages: {
    messages: [
      { shoppingMethod: 'INSTORE_PICKUP', stockMessage: 'In stock' },
      { shoppingMethod: 'DELIVERY', stockMessage: 'Available' },
      { shoppingMethod: 'SHIPPING', stockMessage: 'Unavailable' },
    ],
  },
};

const castelgiocondo: TwProduct = {
  id: '2126262644',
  name: 'Frescobaldi Brunello di Montalcino Castelgiocondo, 2020',
  brand: { name: 'Marchesi Frescobaldi' },
  productUrl: '/wine/red-wine/sangiovese/frescobaldi-brunello-di-montalcino-castelgiocondo/p/2126262644',
  packageDescription: '750ml Bottle',
  categories: [
    { name: 'Tuscany', type: 'REGION' },
    { name: 'Sangiovese', type: 'VARIETAL_TYPE' },
  ],
  price: [
    { price: 79.97, type: 'EDLP' },
    { price: 59.97, type: 'LTSP' },
  ],
  promoBadges: [],
  rating: 93,
  ratingSource: 'Wine Spectator',
  storeId: '535',
  location: 'Aisle 11, Left',
  stockLevel: [{ purchaseLimit: 6, stock: 4 }],
  stockMessages: { messages: [{ shoppingMethod: 'INSTORE_PICKUP', stockMessage: 'Limited quantity' }] },
};

const PAGE = 'https://www.totalwine.com/wine/red-wine/c/000009?pageSize=120&countrystate=Italy&aty=1,0,0,0';

describe('Total Wine page → rows', () => {
  it('splits the year off the name', () => {
    expect(splitVintage('Tenuta di Renieri Chianti Classico, 2023')).toEqual({ name: 'Tenuta di Renieri Chianti Classico', vintage: '2023' });
    expect(splitVintage('St. Giorgio Toscana IGT Super Tuscan')).toEqual({ name: 'St. Giorgio Toscana IGT Super Tuscan', vintage: '' });
  });

  it('reads sizes, colour and pickup wording', () => {
    expect(sizeMl('750ml Bottle')).toBe(750);
    expect(sizeMl('1.5L Bottle')).toBe(1500);
    expect(styleFromUrl('/wine/red-wine/sangiovese/x/p/1')).toBe('red');
    expect(styleFromUrl('/wine/white-wine/chardonnay/x/p/1')).toBe('white');
    expect(styleFromUrl('/wine/dessert-fortified-wine/port/x/p/1')).toBe('dessert');
    expect(pickupStatus('In stock')).toBe('in_stock');
    expect(pickupStatus('Limited quantity')).toBe('limited');
    expect(pickupStatus('Out of stock')).toBe('out');
    // Anything unfamiliar is unknown, never "out".
    expect(pickupStatus('Call store')).toBe('unknown');
  });

  it('maps a product to a bottle and a stock check', () => {
    const { product, check } = mapProduct(renieri, 'Italy');
    expect(product).toMatchObject({
      product_id: '113709750',
      name: 'Tenuta di Renieri Chianti Classico',
      producer: 'Tenuta di Renieri',
      vintage: '2023',
      size_ml: 750,
      style: 'red',
      region: 'Tuscany',
      grape: 'Sangiovese',
      origin: 'Italy',
      url: 'https://www.totalwine.com/wine/red-wine/sangiovese/tenuta-di-renieri-chianti-classico/p/113709750',
      pro_rating: 92,
      rating_source: 'James Suckling',
      customer_rating: 4.3,
      reviews_count: 387,
    });
    expect(check).toMatchObject({ status: 'in_stock', on_hand: 35, aisle: 'Aisle 11, Left', price: 21.99, sale_price: null, deal: 'Mix 6 for $19.79 each' });
    expect(mapProduct(castelgiocondo).check).toMatchObject({ status: 'limited', price: 79.97, sale_price: 59.97 });
  });

  it('only accepts a Total Wine page with one store’s products', () => {
    const body = { store: { id: '535', name: 'Las Colinas (Irving)' }, pageUrl: PAGE, products: [renieri] };
    expect(checkImport(body)).toMatchObject({ ok: true, origin: 'Italy' });
    expect(checkImport({ ...body, pageUrl: 'https://example.com/x' })).toMatchObject({ ok: false });
    expect(checkImport({ ...body, store: { id: '531', name: 'Oak Lawn' } })).toMatchObject({ ok: false, error: 'products from a different store than the one selected' });
    expect(checkImport({ ...body, products: [] })).toMatchObject({ ok: false });
    expect(checkImport({ ...body, products: [{ ...renieri, id: 'x' }] })).toMatchObject({ ok: false });
  });
});

/** A stock row as the app reads it, from a mapped product. */
function row(p: TwProduct, origin = 'Italy'): StockRow {
  const { product, check } = mapProduct(p, origin);
  return { ...check, checked_at: '2026-10-10T12:00:00Z', tw_products: product };
}

describe('imported stock in the app', () => {
  it('turns a stock row into a bottle with its aisle, stock and deal', () => {
    expect(stockBottle(row(renieri))).toMatchObject({
      key: 'totalwine:totalwine.com/wine/red-wine/sangiovese/tenuta-di-renieri-chianti-classico/p/113709750',
      title: 'Tenuta di Renieri Chianti Classico 2023',
      producer: 'Tenuta di Renieri',
      wine: 'Chianti Classico',
      price: 21.99,
      vintage: 2023,
      aisle: 'Aisle 11, Left',
      stock: '35 in stock',
      deal: 'Mix 6 for $19.79 each',
      score: '92 pts (James Suckling)',
    });
    // The sale price is the price, with what it was.
    expect(stockBottle(row(castelgiocondo))).toMatchObject({ price: 59.97, stock: 'Limited quantity', deal: 'Sale, was $79.97' });
    expect(stockBottle({ ...row(renieri), status: 'out' })).toBeNull();
  });

  it('shortlists within budget, best fits first', () => {
    const advisor = makeAdvisor([wine({ producer: 'Fèlsina', name: 'Chianti Classico', region: 'Chianti Classico', grapes: ['Sangiovese'], rating: 'loved', country: 'Italy' })]);
    const bottles = [stockBottle(row(renieri))!, stockBottle(row(castelgiocondo))!];
    expect(shortlist(advisor, bottles, { budget: 40 }).map((b) => b.producer)).toEqual(['Tenuta di Renieri']);
    expect(shortlist(advisor, bottles, { budget: null })).toHaveLength(2);
  });

  it('takes Claude’s picks by number only, within budget', () => {
    const bottles = [stockBottle(row(renieri))!, stockBottle(row(castelgiocondo))!];
    expect(stockLine(bottles[0], 0)).toBe('1. Tenuta di Renieri Chianti Classico 2023 — Tuscany, Sangiovese — $21.99 — Mix 6 for $19.79 each — 92 pts (James Suckling)');
    const stock = { storeName: 'Las Colinas (Irving)', importedAt: 1, count: 2 };
    const list = stockList(
      {
        picks: [
          { n: 2, reason: 'Brunello like the Rancia you want to try' },
          { n: 9, reason: 'invented' },
          { n: 2, reason: 'repeat' },
          { n: 1, reason: 'Chianti like the Fèlsina you loved' },
        ],
        tips: ['Aisle 11 is Italy'],
      },
      bottles,
      30,
      stock,
    );
    expect(list.picks.map((p) => [p.producer, p.claudeReason])).toEqual([['Tenuta di Renieri', 'Chianti like the Fèlsina you loved']]);
    expect(list.fromStock).toEqual(stock);
  });
});

describe('the reason shown on a list pick', () => {
  it('is Claude’s sentence, with your own evidence still ordering the list', async () => {
    const { explainSuggestions } = await import('./recommend');
    const advisor = makeAdvisor([wine({ producer: 'Fèlsina', name: 'Chianti Classico', region: 'Chianti Classico', grapes: ['Sangiovese'], rating: 'loved', country: 'Italy' })]);
    const b = { ...stockBottle(row(renieri))!, claudeReason: 'Like the Fèlsina you loved, at half the price' };
    expect(explainSuggestions(advisor, [b])[0].reason).toBe('Like the Fèlsina you loved, at half the price');
    expect(explainSuggestions(advisor, [{ ...b, claudeReason: '' }])[0].reason).not.toBe('');
  });
});
