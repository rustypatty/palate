import type { WineStyle } from '../types';
import { signedInClient } from './cloud';
import { bottleTitle, normalizeUrl, totalWineImage } from './likeThis';
import { rankCandidates, type RankOptions } from './recommend';
import type { makeAdvisor } from './insights';
import type { SuggestedItem } from './stores';

/**
 * What a Total Wine store had in stock, as imported from your own browser with the Palate
 * Chrome extension (extension/, supabase/totalwine.sql). A list made from this only names
 * bottles that were on the shelf when you imported, with their aisle.
 */

/** An import older than this isn't used for lists: stock moves. */
export const STOCK_FRESH = 7 * 24 * 3600 * 1000;

const STYLES: WineStyle[] = ['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified'];

export interface StockRow {
  product_id: string;
  status: string;
  on_hand: number | null;
  aisle: string;
  price: number | null;
  sale_price: number | null;
  deal: string;
  checked_at: string;
  tw_products: {
    name: string;
    producer: string;
    vintage: string;
    size_ml: number | null;
    style: string | null;
    region: string;
    grape: string;
    origin: string;
    url: string;
    pro_rating: number | null;
    rating_source: string;
  } | null;
}

export interface TwStock {
  storeId: string;
  storeName: string;
  /** When the newest page was imported. */
  importedAt: number;
  bottles: SuggestedItem[];
}

/** One stock row → a bottle the app can rank and show (null if it isn't usable). */
export function stockBottle(row: StockRow): SuggestedItem | null {
  const p = row.tw_products;
  if (!p || !p.url || !p.name) return null;
  if (row.status !== 'in_stock' && row.status !== 'limited') return null;
  // The listed name usually starts with the producer ("Tenuta di Renieri Chianti Classico").
  const wine = p.producer && p.name.toLowerCase().startsWith(`${p.producer.toLowerCase()} `) ? p.name.slice(p.producer.length + 1) : p.name;
  const price = row.sale_price ?? row.price;
  const grapes = p.grape ? [p.grape] : [];
  return {
    key: `totalwine:${normalizeUrl(p.url)}`,
    title: bottleTitle(p.producer, p.name, p.vintage),
    style: STYLES.includes(p.style as WineStyle) ? (p.style as WineStyle) : null,
    price: price && price > 0 ? price : null,
    context: [p.region, p.origin, ...grapes].filter(Boolean).join(' '),
    url: p.url,
    image: totalWineImage(p.url),
    vintage: /^\d{4}$/.test(p.vintage) ? Number(p.vintage) : p.vintage === 'NV' ? 'NV' : null,
    country: p.origin,
    sizeMl: p.size_ml,
    producer: p.producer,
    wine,
    region: p.region,
    grapes,
    claudeReason: '',
    aisle: row.aisle,
    stock: row.status === 'limited' ? 'Limited quantity' : row.on_hand ? `${row.on_hand} in stock` : 'In stock',
    deal: [row.sale_price && row.price && row.sale_price < row.price ? `Sale, was $${row.price.toFixed(2)}` : '', row.deal].filter(Boolean).join(' · '),
    score: p.pro_rating ? `${p.pro_rating} pts${p.rating_source ? ` (${p.rating_source})` : ''}` : '',
  };
}

/**
 * The bottles worth showing Claude: the best fits for your taste from your own ratings, plus the
 * best-reviewed ones you haven't tried anything like, all within budget. Keeps the request small.
 */
export function shortlist(advisor: ReturnType<typeof makeAdvisor>, bottles: SuggestedItem[], opts: RankOptions, n = 50): SuggestedItem[] {
  const budget = opts.budget ?? null;
  const fits = (b: SuggestedItem) => b.sizeMl === null || b.sizeMl === 750;
  const pool = bottles.filter((b) => fits(b) && (budget === null || (b.price !== null && b.price <= budget)));
  const out = new Map<string, SuggestedItem>();
  for (const p of rankCandidates(advisor, pool, opts, Math.round(n * 0.7), 4)) out.set(p.item.key, p.item);
  const passed = new Set((opts.passed ?? []).map((w) => w.suggestion?.key).filter(Boolean));
  const scored = pool.filter((b) => b.score && !out.has(b.key) && !passed.has(b.key)).sort((a, b) => parseInt(b.score!) - parseInt(a.score!));
  for (const b of scored) {
    if (out.size >= n) break;
    out.set(b.key, b);
  }
  return [...out.values()];
}

/** The newest import's stock (in stock or limited, imported in the last week); null if none or signed out. */
export async function loadTwStock(now = Date.now()): Promise<TwStock | null> {
  const sb = await signedInClient();
  if (!sb) return null;
  const { data: stores, error } = await sb.from('tw_stores').select('store_id, name, imported_at').order('imported_at', { ascending: false }).limit(1);
  if (error || !stores?.length) return null;
  const store = stores[0] as { store_id: string; name: string; imported_at: string };
  const since = new Date(now - STOCK_FRESH).toISOString();
  const rows: StockRow[] = [];
  // Page through: the API returns at most 1000 rows per request.
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await sb
      .from('tw_stock')
      .select('product_id, status, on_hand, aisle, price, sale_price, deal, checked_at, tw_products(name, producer, vintage, size_ml, style, region, grape, origin, url, pro_rating, rating_source)')
      .eq('store_id', store.store_id)
      .in('status', ['in_stock', 'limited'])
      .gte('checked_at', since)
      .order('product_id')
      .range(from, from + 999);
    if (e) throw new Error(e.message);
    rows.push(...((data ?? []) as unknown as StockRow[]));
    if (!data || data.length < 1000) break;
  }
  const bottles = rows.map(stockBottle).filter((b): b is SuggestedItem => b !== null);
  if (!bottles.length) return null;
  return { storeId: store.store_id, storeName: store.name, importedAt: Date.parse(store.imported_at), bottles };
}
