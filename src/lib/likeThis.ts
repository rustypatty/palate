import type { LikeBottle, StoreOffer, Wine } from '../types';
import { mentioned } from './insights';
import { possessive, STORES, storeById, type StoreId, type StoreItem } from './stores';
import { fold, tokens } from './text';

/**
 * "Bottles like this to buy" on a wine's page: one Claude search across all the
 * stores' websites per wine, saved on the wine (so it syncs and reopening is free),
 * refreshed automatically after a month or on request.
 */

export const LIKE_REFRESH_MS = 30 * 24 * 3600 * 1000;
export const LIKE_COST = '~30¢';

/** Stores searched by Claude, Total Wine first. */
export const SEARCH_STORES = STORES.filter((s) => s.kind === 'search');

export function storeForDomain(url: string): StoreId | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return STORES.find((s) => host === s.domain || host.endsWith(`.${s.domain}`))?.id ?? null;
  } catch {
    return null;
  }
}

/** Same page regardless of tracking parameters, "www." or a trailing slash. */
export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u.trim());
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
}

export interface ReportedBottle {
  producer: string;
  wine: string;
  vintage: string;
  region: string;
  country: string;
  grapes: string[];
  style: LikeBottle['style'];
  offers: { url: string; price_usd: number }[];
  reason: string;
}

/**
 * Keep only offers whose page is on one of the stores' sites and actually turned up
 * in the search results; a bottle with none left becomes a "look for" tip.
 */
export function verifyBottles(reported: ReportedBottle[], seen: Set<string>): { bottles: LikeBottle[]; tips: string[] } {
  const bottles: LikeBottle[] = [];
  const tips: string[] = [];
  for (const b of reported) {
    const offers: StoreOffer[] = [];
    for (const o of b.offers) {
      const storeId = storeForDomain(o.url);
      const norm = normalizeUrl(o.url);
      if (!storeId || storeById(storeId).kind !== 'search' || !seen.has(norm)) continue;
      if (offers.some((x) => x.storeId === storeId)) continue;
      offers.push({ storeId, url: o.url, price: o.price_usd > 0 ? o.price_usd : null });
    }
    if (!offers.length || !b.producer || !b.wine) {
      if (b.producer) tips.push(`${b.producer}${b.region ? ` (${b.region})` : ''}`);
      continue;
    }
    offers.sort((x, y) => (x.price ?? Infinity) - (y.price ?? Infinity));
    bottles.push({
      key: `like:${fold(`${b.producer} ${b.wine}`)}`,
      producer: b.producer,
      wine: b.wine,
      vintage: b.vintage,
      region: b.region,
      country: b.country,
      grapes: b.grapes,
      style: b.style,
      offers,
      image: null,
      reason: b.reason,
    });
  }
  // The same bottle reported twice: merge its offers.
  const merged: LikeBottle[] = [];
  for (const b of bottles) {
    const twin = merged.find((m) => m.key === b.key);
    if (!twin) merged.push(b);
    else for (const o of b.offers) if (!twin.offers.some((x) => x.storeId === o.storeId)) twin.offers.push(o);
  }
  return { bottles: merged, tips: [...new Set(tips)] };
}

/** Is this store listing the same producer and cuvée as the bottle? */
export function sameBottle(b: LikeBottle, title: string): boolean {
  const q = tokens(title);
  return mentioned(b.producer, q, false) && mentioned(b.wine, q, false);
}

/** A shop page's title names this producer and cuvée: its photo is of this wine. */
export function photoMatches(b: Pick<LikeBottle, 'producer' | 'wine'>, pageTitle: string): boolean {
  const q = tokens(pageTitle);
  return Boolean(pageTitle) && mentioned(b.producer, q, false) && mentioned(b.wine, q, false);
}

/**
 * "Brotte" + "Brotte Chateauneuf du Pape" reads "Brotte Chateauneuf du Pape"; also when the
 * store uses a shorter form of the producer ("E. Guigal" + "Guigal Gigondas").
 */
export function bottleTitle(producer: string, wine: string, vintage: string): string {
  const p = tokens(producer);
  const w = tokens(wine);
  // The wine name already starts with the producer, in full or shortened ("Guigal", "St. Cosme").
  const opening = w.slice(0, 2);
  // Whole words only: "Ridge" is not inside "Partridge Hill".
  const inWine = p.length > 0 && (` ${w.join(' ')} `.includes(` ${p.join(' ')} `) || p.filter((t) => t.length > 3).some((t) => opening.includes(t)));
  return [inWine ? '' : producer, wine, wine.includes(vintage) ? '' : vintage].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Through an image relay: works around sites that block other pages from showing their images,
 * and puts transparent product shots on white. */
export function relayImage(url: string): string {
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=1000&h=1000&fit=inside&we&bg=white&output=jpg&q=86`;
}

/** Total Wine's own product photo, from the product number in its page address (…/p/115641750). */
export function totalWineImage(pageUrl: string): string | null {
  const m = pageUrl.match(/totalwine\.com\/[^?#]*\/p\/(\d{5,})/i);
  return m ? relayImage(`https://www.totalwine.com/dynamic/x1000,sq/images/${m[1]}/${m[1]}-1-fr.png`) : null;
}

/** The best store photo of this exact bottle: Total Wine's own, else whatever the search found. */
export function bottlePhoto(b: Pick<LikeBottle, 'offers' | 'image'>): LikeBottle['image'] {
  const tw = b.offers.find((o) => o.storeId === 'totalwine');
  const twImg = tw ? totalWineImage(tw.url) : null;
  if (twImg) return { url: twImg, pageUrl: tw!.url, siteName: 'Total Wine' };
  return b.image;
}

/** A found bottle as a rankable store item (its cheapest offer is the main one). */
export function bottleAsItem(b: LikeBottle): StoreItem & { offers: StoreOffer[]; imageSource?: { name: string; pageUrl: string } } {
  const main = b.offers.find((o) => o.storeId === 'totalwine') ?? b.offers[0];
  const photo = bottlePhoto(b);
  const prices = b.offers.map((o) => o.price).filter((p): p is number => p !== null);
  return {
    key: b.key,
    title: bottleTitle(b.producer, b.wine, b.vintage),
    style: b.style,
    price: prices.length ? Math.min(...prices) : null,
    context: [b.region, b.country, ...b.grapes].join(' '),
    url: main.url,
    image: photo?.url ?? null,
    imageSource: photo ? { name: photo.siteName, pageUrl: photo.pageUrl } : undefined,
    vintage: /^\d{4}$/.test(b.vintage) ? Number(b.vintage) : b.vintage === 'NV' ? 'NV' : null,
    country: b.country,
    sizeMl: null,
    offers: b.offers,
  };
}

/** Add free Pogo's listings of the same bottle as extra offers. */
export function withPogoOffers(bottles: LikeBottle[], pogo: StoreItem[]): LikeBottle[] {
  return bottles.map((b) => {
    if (b.offers.some((o) => o.storeId === 'pogos')) return b;
    const hit = pogo.find((p) => sameBottle(b, p.title));
    if (!hit) return b;
    const offers = [...b.offers, { storeId: 'pogos', url: hit.url, price: hit.price }].sort((x, y) => (x.price ?? Infinity) - (y.price ?? Infinity));
    return { ...b, offers, image: b.image ?? (hit.image ? { url: hit.image, pageUrl: hit.url, siteName: storeById('pogos').name } : null) };
  });
}

export function offerLabel(o: StoreOffer): string {
  const name = storeById(o.storeId as StoreId)?.name ?? o.storeId;
  return o.price !== null ? `${name} $${o.price.toFixed(2).replace(/\.00$/, '')}` : name;
}

export function isStale(w: Wine, now = Date.now()): boolean {
  return !w.likeThis || now - w.likeThis.at > LIKE_REFRESH_MS;
}

export const storesSearched = () => SEARCH_STORES.map((s) => s.name);
export { possessive };

// ---------- Running the search ----------

const inFlight = new Map<string, Promise<{ ok: boolean; reason?: string }>>();
/** The last failure per wine this session, so it stays on screen after leaving and coming back. */
const lastError = new Map<string, string>();
const listeners = new Set<() => void>();

export const likeSearch = {
  running: (id: string) => inFlight.has(id),
  error: (id: string) => lastError.get(id) ?? null,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/**
 * Search the stores for bottles like this wine (about 30¢) and save them on the wine.
 * Only one search per wine at a time; it finishes even if you leave the page.
 */
export function searchLikeThis(wine: Wine, req: Omit<import('./likeThisClient').LikeRequest, 'wine'>): Promise<{ ok: boolean; reason?: string }> {
  const running = inFlight.get(wine.id);
  if (running) return running;
  lastError.delete(wine.id);
  const job = (async () => {
    const { getApiKey } = await import('./labelReader');
    const apiKey = getApiKey();
    if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
    const out = await (await import('./likeThisClient')).findLikeThisWithClaude(apiKey, { ...req, wine });
    if (!out.ok) return { ok: false, reason: out.reason };
    const { updateWine } = await import('../db');
    await updateWine(wine.id, { likeThis: out.cache });
    return { ok: true };
  })()
    .catch((e: unknown) => ({ ok: false, reason: e instanceof Error ? e.message : 'something went wrong' }))
    .then((r) => {
      if (!r.ok) lastError.set(wine.id, r.reason ?? 'something went wrong');
      return r;
    })
    .finally(() => {
      inFlight.delete(wine.id);
      listeners.forEach((l) => l());
    });
  inFlight.set(wine.id, job);
  listeners.forEach((l) => l());
  return job;
}

/** "3 at Total Wine, 1 at Spec’s" */
export function checkedSummary(c: NonNullable<import('../types').LikeThisCache['checked']>): string {
  const parts = SEARCH_STORES.filter((st) => c.byStore[st.id]).map((st) => `${c.byStore[st.id]} at ${st.name}`);
  return parts.join(', ');
}
