import type { Wine, WineStyle } from '../types';
import { signedInClient } from './cloud';
import { bottleTitle, normalizeUrl, totalWineImage } from './likeThis';
import { rankCandidates, type RankOptions } from './recommend';
import { tokens } from './text';
import type { makeAdvisor } from './insights';
import type { SuggestedItem } from './stores';

/**
 * What a Total Wine store had in stock, as imported from your own browser with the Palate
 * Chrome extension (extension/, supabase/totalwine.sql). A list made from this only names
 * bottles that were on the shelf when you imported, with their aisle.
 */

/** An import older than this isn't used for lists: stock moves. The weekly refresh keeps it newer. */
export const STOCK_FRESH = 10 * 24 * 3600 * 1000;

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

// Shop shorthand and accents vary ("Clos St Michel", "1er Cru", "Dom de la Bressande"): compare on one spelling.
const SAME: Record<string, string> = { st: 'saint', ste: 'sainte', '1er': 'premier', dom: 'domaine', chateauneuf: 'chateauneuf', cdp: 'chateauneuf' };
// Words that say little about which wine it is.
const FILLER = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'di', 'del', 'della', 'da', 'd', 'l', 'y', 'e', 'et', 'and', 'the', 'en', 'domaine', 'chateau', 'bodegas', 'bodega', 'vina', 'rouge', 'red', 'vin', 'tinto', 'rosso']);

const COMMON = new Set(['saint', 'sainte', 'clo', 'tenuta', 'marchesi', 'marchese', 'barone', 'cantina', 'castello', 'weingut', 'maison', 'famille', 'estate', 'vineyard', 'cellar', 'winery', 'grand', 'mont']);

function words(s: string): string[] {
  return tokens(s.replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `))
    .map((t) => SAME[t] ?? t)
    .filter((t) => !FILLER.has(t))
    // "Réservée" and "Reserve", "Vieilles" and "Vieille".
    .map((t) => t.replace(/e?e$|s$/, ''))
    .filter(Boolean);
}

// Words that mark a different cuvée from the same producer.
const TIER = new Set(words('grand gran reserve reserva riserva vieilles vv selection selezione special speciale prestige cuvee old vines single'));

/**
 * A wine from your collection that this bottle is (any vintage): same producer, and nearly all of
 * your wine's name in the store's listing. Looser than the label matcher, because shops shorten
 * names ("Mousset Clos St Michel Chateauneuf du Pape" is your "Clos Saint Michel (Mousset) Châteauneuf-du-Pape").
 */
export function alreadyHave(b: Pick<SuggestedItem, 'producer' | 'wine' | 'title'>, collection: Wine[]): Wine | null {
  const listing = new Set(words(`${b.producer} ${b.title}`));
  // The listing's name without its brand at the front, so "Marchesi di Barolo Barbera" isn't a Barolo.
  const brand = new Set(words(b.producer));
  const nameWords = words(b.title);
  while (nameWords.length && brand.has(nameWords[0])) nameWords.shift();
  const name = new Set(nameWords);
  for (const w of collection) {
    const { producer, mine, known } = prepared(w);
    if (!producer.length || producer.filter((t) => listing.has(t)).length < (producer.length * 2) / 3) continue;
    if (!mine.length) continue;
    const found = mine.filter((t) => name.has(t)).length;
    if (found / mine.length < 0.75) continue;
    // Words the listing has beyond yours: a place or a year is fine, a tier ("Grand Vin", "Riserva") is another cuvée.
    const extra = [...name].filter((t) => !known.has(t) && !brand.has(t) && !/^\d+$/.test(t));
    if (extra.length === 0 || (extra.length === 1 && !TIER.has(extra[0]))) return w;
  }
  return null;
}

// Each of your wines' words, worked out once rather than for every bottle in the store.
const cache = new WeakMap<Wine, { producer: string[]; mine: string[]; known: Set<string> }>();
function prepared(w: Wine) {
  let p = cache.get(w);
  if (!p) {
    // The producer's own name, not words many producers share ("Clos Saint Jean" is not "Clos St Michel").
    const producer = words(w.producer).filter((t) => t.length > 3 && !COMMON.has(t));
    // Your wine's own name, without the producer's words unless that's all it is (Marchesi di Barolo "Barolo").
    const all = words(w.name);
    const mine = all.some((t) => !producer.includes(t)) ? all.filter((t) => !producer.includes(t)) : all;
    p = { producer, mine, known: new Set([...mine, ...words(w.producer), ...words(w.region)]) };
    cache.set(w, p);
  }
  return p;
}

/**
 * The bottles worth showing Claude: the best fits for your taste from your own ratings, plus the
 * best-reviewed ones you haven't tried anything like, all within budget. Keeps the request small.
 * Bottles already in your collection (tried or at home, any vintage) are left out.
 */
export function shortlist(advisor: ReturnType<typeof makeAdvisor>, bottles: SuggestedItem[], opts: RankOptions & { have?: Wine[] }, n = 50): SuggestedItem[] {
  const budget = opts.budget ?? null;
  const fits = (b: SuggestedItem) => b.sizeMl === null || b.sizeMl === 750;
  const pool = bottles.filter((b) => fits(b) && (budget === null || (b.price !== null && b.price <= budget)) && !alreadyHave(b, opts.have ?? []));
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

export interface RefreshJob {
  kind: 'weekly' | 'manual';
  status: 'queued' | 'running' | 'needs_you' | 'done' | 'failed' | 'expired';
  next_page: number;
  total_pages: number | null;
  message: string;
  created_at: string;
  finished_at: string | null;
}

/** The lists the extension refreshes, and the latest refresh (null when signed out). */
export async function loadRefresh(): Promise<{ lists: number; job: RefreshJob | null } | null> {
  const sb = await signedInClient();
  if (!sb) return null;
  const [{ count }, { data }] = await Promise.all([
    sb.from('tw_sources').select('id', { count: 'exact', head: true }).eq('active', true),
    sb
      .from('tw_jobs')
      .select('kind, status, next_page, total_pages, message, created_at, finished_at, tw_sources!inner(active)')
      .eq('tw_sources.active', true)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  return { lists: count ?? 0, job: (data?.[0] as RefreshJob | undefined) ?? null };
}

/** Ask the extension on your computer to refresh every imported list now. */
export async function requestRefresh(): Promise<void> {
  const sb = await signedInClient();
  if (!sb) throw new Error('Sign in first.');
  const { error } = await sb.rpc('request_tw_refresh');
  if (error) throw new Error(error.message);
}

export const refreshOpen = (job: RefreshJob | null) => Boolean(job && ['queued', 'running', 'needs_you'].includes(job.status));

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
