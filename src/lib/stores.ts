import { db, type PalateDB } from '../db';
import type { WineStyle } from '../types';
import type { Candidate } from './recommend';

/**
 * Stores Rusty shops at. Pogo's publishes its full wine list (prices and stock) openly,
 * so the app reads it directly and ranks it on the phone for free. The others block
 * apps from reading their stock, so suggestions there come from Claude searching the
 * store's own website, with links to check your location.
 */

export type StoreId = 'pogos' | 'totalwine' | 'wholefoods' | 'twin' | 'specs' | 'centralmarket';

export interface Store {
  id: StoreId;
  name: string;
  kind: 'catalog' | 'search';
  /** Website domain, used to keep suggestions to this store's own pages. */
  domain: string;
}

export const STORES: Store[] = [
  { id: 'totalwine', name: 'Total Wine', kind: 'search', domain: 'totalwine.com' },
  { id: 'pogos', name: 'Pogo’s', kind: 'catalog', domain: 'pogoswine.com' },
  { id: 'wholefoods', name: 'Whole Foods', kind: 'search', domain: 'wholefoodsmarket.com' },
  { id: 'twin', name: 'Twin Liquors', kind: 'search', domain: 'twinliquors.com' },
  { id: 'specs', name: 'Spec’s', kind: 'search', domain: 'specsonline.com' },
  { id: 'centralmarket', name: 'Central Market', kind: 'search', domain: 'centralmarket.com' },
];

export const storeById = (id: StoreId) => STORES.find((s) => s.id === id)!;

export interface StoreItem extends Candidate {
  url: string;
  /** The store's own product photo, if it has one. */
  image: string | null;
  /** When the photo comes from another shop's page for the same wine. */
  imageSource?: { name: string; pageUrl: string };
  vintage: number | 'NV' | null;
  country: string;
  sizeMl: number | null;
}

/** A Claude suggestion from a store's website. `verified` = its page turned up in the search results. */
export interface SuggestedItem extends StoreItem {
  producer: string;
  wine: string;
  region: string;
  grapes: string[];
  claudeReason: string;
}

export interface StoreList {
  picks: SuggestedItem[];
  /** Section-level advice, and bottles that couldn't be confirmed, as producer/style tips. */
  tips: string[];
  budget: number | null;
}

export interface StoreCache {
  id: StoreId;
  fetchedAt: number;
  items?: StoreItem[];
  list?: StoreList;
}

/** How long a list Claude made for a store is kept: an hour, for one trip to the shop. */
export const LIST_TTL = 60 * 60 * 1000;

/** A Claude-made list that has passed its hour (Pogo's downloaded wine list doesn't expire). */
export const listExpired = (c: StoreCache, now = Date.now()) => Boolean(c.list) && now - c.fetchedAt >= LIST_TTL;

/** Clear a store's list (the Clear button, or after its hour). */
export function clearStoreList(id: StoreId, database: PalateDB = db) {
  return database.stores.delete(id);
}

export function cacheFor(id: StoreId, database: PalateDB = db) {
  return database.stores.get(id);
}

// ---------- Pogo's (Shopify catalog) ----------

const TYPE_STYLE: Record<string, WineStyle> = {
  red: 'red',
  white: 'white',
  sparkling: 'sparkling',
  rose: 'rose',
  'rosé': 'rose',
  orange: 'orange',
  dessert: 'dessert',
  port: 'fortified',
  sherry: 'fortified',
  madeira: 'fortified',
  marsala: 'fortified',
  fortified: 'fortified',
};

const COUNTRY_TAG: Record<string, string> = {
  french: 'France',
  italian: 'Italy',
  spanish: 'Spain',
  portuguese: 'Portugal',
  german: 'Germany',
  austrian: 'Austria',
  argentina: 'Argentina',
  argentinian: 'Argentina',
  chilean: 'Chile',
  chile: 'Chile',
  australian: 'Australia',
  'new zealand': 'New Zealand',
  'south african': 'South Africa',
  'united states': 'United States',
  american: 'United States',
  greek: 'Greece',
  lebanese: 'Lebanon',
  hungarian: 'Hungary',
};

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  product_type: string;
  tags: string[] | string;
  variants: { price: string; available: boolean }[];
  images: { src: string }[];
}

/** One Pogo's listing → a bottle the app can rank, or null for non-wine / sold out. */
export function parseShopifyProduct(p: ShopifyProduct, base = 'https://www.pogoswine.com'): StoreItem | null {
  const style = TYPE_STYLE[p.product_type.trim().toLowerCase()];
  if (!style) return null; // sake, non-alcoholic, spirits…
  const tags = Array.isArray(p.tags) ? p.tags : p.tags.split(',').map((t) => t.trim());
  if (tags.some((t) => /^sold out$/i.test(t))) return null;
  const variant = p.variants.find((v) => v.available);
  if (!variant) return null;
  const size = p.title.match(/\((\d+(?:\.\d+)?)\s*(ml|l)\)/i);
  const sizeMl = size ? Math.round(Number(size[1]) * (size[2].toLowerCase() === 'l' ? 1000 : 1)) : null;
  const title = p.title.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const year = title.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  const vintage = year ? Number(year[1]) : /\bNV\b/.test(title) ? 'NV' : null;
  const countryTag = tags.map((t) => t.match(/^(.+) wine$/i)?.[1]?.toLowerCase()).find((c) => c && COUNTRY_TAG[c]);
  const src = p.images[0]?.src;
  return {
    key: `pogos:${p.id}`,
    title,
    style,
    price: Number(variant.price) || null,
    url: `${base}/products/${p.handle}`,
    image: src ? `${src}${src.includes('?') ? '&' : '?'}width=480` : null,
    vintage,
    country: countryTag ? COUNTRY_TAG[countryTag] : '',
    context: countryTag ? COUNTRY_TAG[countryTag] : '',
    sizeMl,
  };
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(new DOMException('Aborted', 'AbortError'))), { once: true });
  });

/**
 * One page of listings. The site sometimes answers rapid requests with a "verifying your
 * connection" page instead of data; waiting a few seconds and asking again gets through.
 */
async function fetchPage(url: string, signal?: AbortSignal): Promise<ShopifyProduct[]> {
  let last = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await wait(1500 * 2 ** (attempt - 1), signal);
    try {
      const res = await fetch(url, { signal, credentials: 'omit' });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { products?: ShopifyProduct[] } | null;
        if (data && Array.isArray(data.products)) return data.products;
        last = 'the website asked to verify the connection';
      } else last = `the website answered ${res.status}`;
    } catch (e) {
      if (signal?.aborted) throw e;
      last = 'no connection';
    }
  }
  throw new Error(`Couldn’t load Pogo’s list (${last}). Try again in a minute.`);
}

/** Download Pogo's whole wine list (about 13 pages, under 1 MB) and save it on this device. */
export async function refreshPogos(signal?: AbortSignal, database: PalateDB = db): Promise<StoreItem[]> {
  const items: StoreItem[] = [];
  for (let page = 1; page <= 40; page++) {
    const products = await fetchPage(`https://www.pogoswine.com/collections/wine/products.json?limit=250&page=${page}`, signal);
    for (const p of products) {
      const item = parseShopifyProduct(p);
      if (item) items.push(item);
    }
    if (products.length < 250) break;
    await wait(250, signal); // gentle on their site
  }
  await database.stores.put({ id: 'pogos', fetchedAt: Date.now(), items });
  return items;
}

// ---------- Suggestion lists from Claude (stores that block reading their stock) ----------

export type { StoreListRequest, StoreListOutcome } from './storeListClient';

/** Ask Claude for a list at a store (about 25¢), and save it on this device. */
export async function requestStoreList(
  req: import('./storeListClient').StoreListRequest,
  signal?: AbortSignal,
  database: PalateDB = db,
): Promise<import('./storeListClient').StoreListOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  const out = await (await import('./storeListClient')).findStoreListWithClaude(apiKey, req, signal);
  if (out.ok) await database.stores.put({ id: req.store.id, fetchedAt: Date.now(), list: out.list });
  return out;
}

/** "Total Wine’s", but "Pogo’s" stays "Pogo’s". */
export function possessive(name: string): string {
  return /['’]s$/.test(name) ? name : `${name}’s`;
}
