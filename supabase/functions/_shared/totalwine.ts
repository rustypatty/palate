/**
 * Total Wine products as the "Import this page" extension sends them (a whitelisted copy of
 * window.INITIAL_STATE.search.results.products, see docs/totalwine-collection.md), turned into
 * Palate's two kinds of row: the bottle itself, and one stock check at one store.
 *
 * Plain TypeScript with no Deno or browser imports, so the app's tests can run it too.
 */

export interface TwProduct {
  id: string;
  name: string;
  brand?: { name?: string } | null;
  productUrl?: string;
  packageDescription?: string;
  categories?: { name: string; type: string }[];
  price?: { price: number; type: string }[];
  promoBadges?: { badgeSubType?: string; badgePromotionDescription?: string }[];
  customerAverageRating?: number;
  customerReviewsCount?: number;
  rating?: number;
  ratingSource?: string;
  storeId?: string;
  storeName?: string;
  location?: string;
  stockLevel?: { stock?: number; purchaseLimit?: number }[];
  stockMessages?: { messages?: { shoppingMethod: string; stockMessage: string }[] };
}

export type StockStatus = 'in_stock' | 'limited' | 'out' | 'unknown';

export interface ProductRow {
  retailer: 'totalwine';
  product_id: string;
  name: string;
  producer: string;
  /** "2023", "NV", or "" when the name doesn't show one. */
  vintage: string;
  size_ml: number | null;
  size_text: string;
  style: string | null;
  region: string;
  grape: string;
  /** The page's Country/State filter when one was set (e.g. "Italy"), else "". */
  origin: string;
  url: string;
  pro_rating: number | null;
  rating_source: string;
  customer_rating: number | null;
  reviews_count: number | null;
}

export interface CheckRow {
  retailer: 'totalwine';
  product_id: string;
  store_id: string;
  status: StockStatus;
  /** Total Wine's own pickup wording, kept as evidence. */
  stock_message: string;
  on_hand: number | null;
  purchase_limit: number | null;
  aisle: string;
  price: number | null;
  sale_price: number | null;
  /** A conditional price with its condition, e.g. "Mix 6 for $19.79 each". */
  deal: string;
}

const BASE = 'https://www.totalwine.com';

/** "Tenuta di Renieri Chianti Classico, 2023" → { name without the year, "2023" }. */
export function splitVintage(name: string): { name: string; vintage: string } {
  const m = name.match(/^(.*?),?\s+((?:19|20)\d\d|NV)\s*$/);
  return m ? { name: m[1].trim(), vintage: m[2] } : { name: name.trim(), vintage: '' };
}

/** "750ml Bottle" → 750, "1.5L Bottle" → 1500. */
export function sizeMl(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(ml|l)\b/i);
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2].toLowerCase() === 'l' ? 1000 : 1));
}

/** The wine's colour from where it sits on the site, e.g. /wine/red-wine/… → red. */
export function styleFromUrl(url: string): string | null {
  const seg = url.match(/^\/?wine\/([^/]+)/i)?.[1]?.toLowerCase() ?? '';
  if (seg.startsWith('red')) return 'red';
  if (seg.startsWith('white')) return 'white';
  if (seg.startsWith('rose') || seg.startsWith('ros')) return 'rose';
  if (seg.includes('sparkling') || seg.includes('champagne')) return 'sparkling';
  if (seg.includes('dessert')) return 'dessert';
  if (seg.includes('fortified') || seg.includes('port') || seg.includes('sherry')) return 'fortified';
  return null;
}

/** Total Wine's pickup wording → in stock / limited / out / unknown. Anything unfamiliar is unknown, never "out". */
export function pickupStatus(message: string): StockStatus {
  if (/limited/i.test(message)) return 'limited';
  if (/^\s*in stock/i.test(message)) return 'in_stock';
  if (/out of stock|unavailable|not available|sold out/i.test(message)) return 'out';
  return 'unknown';
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function mapProduct(p: TwProduct, origin = ''): { product: ProductRow; check: CheckRow } {
  const { name, vintage } = splitVintage(p.name ?? '');
  const cat = (type: string) => p.categories?.find((c) => c.type === type)?.name ?? '';
  const price = (type: string) => num(p.price?.find((x) => x.type === type)?.price);
  const message = p.stockMessages?.messages?.find((m) => m.shoppingMethod === 'INSTORE_PICKUP')?.stockMessage ?? '';
  const level = p.stockLevel?.[0];
  const path = p.productUrl ?? '';
  return {
    product: {
      retailer: 'totalwine',
      product_id: String(p.id),
      name,
      producer: p.brand?.name?.trim() ?? '',
      vintage,
      size_ml: sizeMl(p.packageDescription ?? ''),
      size_text: p.packageDescription ?? '',
      style: styleFromUrl(path),
      region: cat('REGION'),
      grape: cat('VARIETAL_TYPE'),
      origin,
      url: path ? `${BASE}${path.startsWith('/') ? '' : '/'}${path}` : '',
      pro_rating: p.rating ? p.rating : null,
      rating_source: p.rating ? (p.ratingSource ?? '') : '',
      customer_rating: p.customerReviewsCount ? num(p.customerAverageRating) : null,
      reviews_count: p.customerReviewsCount ? num(p.customerReviewsCount) : null,
    },
    check: {
      retailer: 'totalwine',
      product_id: String(p.id),
      store_id: String(p.storeId ?? ''),
      status: pickupStatus(message),
      stock_message: message,
      on_hand: num(level?.stock),
      purchase_limit: num(level?.purchaseLimit),
      aisle: p.location ?? '',
      price: price('EDLP'),
      sale_price: price('LTSP'),
      deal: p.promoBadges?.map((b) => b.badgePromotionDescription?.trim()).filter(Boolean).join(' · ') ?? '',
    },
  };
}

export interface ImportPayload {
  store: { id: string; name: string; city?: string };
  pageUrl: string;
  pagination?: { page?: number; pageSize?: number; totalPages?: number; totalResults?: number };
  products: TwProduct[];
}

/** Check an import before anything is saved: right site, one store, products that belong to it. */
export function checkImport(body: unknown): { ok: true; payload: ImportPayload; origin: string } | { ok: false; error: string } {
  const b = body as Partial<ImportPayload> | null;
  if (!b || typeof b !== 'object') return { ok: false, error: 'empty import' };
  if (!b.store || typeof b.store.id !== 'string' || !/^\d{1,6}$/.test(b.store.id) || typeof b.store.name !== 'string') return { ok: false, error: 'no store on the page' };
  let url: URL;
  try {
    url = new URL(String(b.pageUrl));
  } catch {
    return { ok: false, error: 'bad page address' };
  }
  if (!/(^|\.)totalwine\.com$/.test(url.hostname)) return { ok: false, error: 'not a Total Wine page' };
  if (!Array.isArray(b.products) || b.products.length === 0) return { ok: false, error: 'no products on the page' };
  if (b.products.length > 200) return { ok: false, error: 'too many products in one import' };
  for (const p of b.products) {
    if (!p || typeof p.id !== 'string' || !/^\d{3,12}$/.test(p.id) || typeof p.name !== 'string') return { ok: false, error: 'a product is missing its ID or name' };
    if (p.storeId !== undefined && String(p.storeId) !== b.store.id) return { ok: false, error: 'products from a different store than the one selected' };
  }
  return { ok: true, payload: b as ImportPayload, origin: url.searchParams.get('countrystate') ?? '' };
}

/** A list's address for refreshing it: no page number, 120 a page (fewest page loads), filters in a fixed order. */
export function sourceUrl(pageUrl: string): string {
  const u = new URL(pageUrl);
  u.searchParams.delete('page');
  u.searchParams.set('pageSize', '120');
  u.searchParams.sort();
  u.hash = '';
  return u.toString();
}
