import { isBottleShot } from './likePhotos';
import { GRAPES, lookupCatalog, searchCatalogAt, type CatalogWine } from './catalogMatch';
import { norm } from './catalogNorm';
import { relayedImageUrl, type WineLookup } from './labelClient';
import type { LabelReading } from './labelReader';
import type { ShelfBottle, ShelfCatalog } from './shelf';
import { SUPABASE_KEY, SUPABASE_URL } from './supabaseConfig';
import type { WineStyle } from '../types';

/**
 * Palate's wine catalog (about 167,000 wines in Supabase, read-only): a free lookup in a second
 * or two that fills in colour, grapes, region and a bottle photo for a snapped label. Only a
 * sure match is used; anything else goes to the web lookup as before.
 */

export const catalogConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** One catalog search, given a few seconds; a cancelled or failed call is tried once more. */
async function search(text: string, signal?: AbortSignal): Promise<CatalogWine[]> {
  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(6000);
    try {
      return await searchCatalogAt(SUPABASE_URL!, SUPABASE_KEY!, text, 25, signal ? AbortSignal.any([signal, timeout]) : timeout);
    } catch (e) {
      if (attempt >= 1 || signal?.aborted) throw e;
    }
  }
}

// Grape names beyond the matcher's list, so a catalog grape is kept only when it is a grape
// ("Tempranillo", not a shop's stray "Indulge").
const MORE_GRAPES = new Set(
  `davola cannonau athiri arneis cortese nerello mascalese frappato grillo catarratto inzolia insolia lambrusco negroamaro sagrantino
refosco timorasso ruche pecorino passerina garganega rondinella molinara corvinone croatina vespolina grignolino freisa picpoul piquepoul
clairette bourboulenc counoise aligote savagnin trousseau poulsard mondeuse jacquere chasselas manseng gros courbu cot auxerrois meunier
petit petite welschriesling muskateller zierfandler rotgipfler loureiro arinto encruzado baga castelao alfrocheiro trincadeira aragonez
sousao malvasia verdelho moscatel bobal cencibel mazuelo carignane muscadelle sciaccerellu nielluccio vermentinu listan perricone
susumaniello primitivo cserszegi harslevelu kekfrankos plavac mali vranec rkatsiteli saperavi`.split(/\s+/),
);

// Words that only appear inside a grape's name ("Pinot Noir", "Nero d'Avola", "Touriga Nacional").
const GRAPE_PARTS = new Set(['blanc', 'noir', 'gris', 'tinta', 'tinto', 'fino', 'nacional', 'franca', 'roriz', 'de', 'di', 'del', 'd', 'la']);

const isGrape = (g: string) => {
  const words = norm(g).split(' ').filter(Boolean);
  const known = (t: string) => GRAPES.has(t) || MORE_GRAPES.has(t);
  return words.some(known) && words.every((t) => known(t) || GRAPE_PARTS.has(t));
};

/** The catalog's grapes that really are grape names, as written, each once ("Carignan" = "Carignane", "Mourvedre" = "Mourvèdre"). */
export function cleanGrapes(grapes: string[] | null): string[] {
  const seen = new Map<string, string>();
  for (const g of (grapes ?? []).map((x) => x.trim())) {
    const key = norm(g).replace(/e$/, '');
    if (g && isGrape(g) && !seen.has(key)) seen.set(key, g);
  }
  return [...seen.values()];
}

const STYLES: WineStyle[] = ['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified'];

/** "www.bottlebarn.com" → "bottlebarn.com" */
const siteName = (domain: string | null, pageUrl: string | null) => {
  const host = domain || (pageUrl ? new URL(pageUrl).hostname : '');
  return host.replace(/^www\./, '');
};

export interface CatalogDeps {
  search: (text: string, signal?: AbortSignal) => Promise<CatalogWine[]>;
  isBottle: (url: string) => Promise<boolean>;
}

const DEFAULT_DEPS: CatalogDeps = { search, isBottle: (url) => isBottleShot(url).catch(() => false) };

/**
 * The snapped wine from the catalog, as the same details the web lookup gives. Null when the
 * catalog isn't sure (or can't be reached). Without a clean bottle shot the details still come
 * back, with no photo: the bottle photo is found later, not by a paid web lookup now.
 */
export async function catalogLookup(
  reading: LabelReading,
  needPhoto: boolean,
  signal?: AbortSignal,
  deps: CatalogDeps = DEFAULT_DEPS,
): Promise<WineLookup | null> {
  if (!catalogConfigured && deps === DEFAULT_DEPS) return null;
  if (!reading.is_wine_label || !(reading.producer.trim() || reading.wine_name.trim())) return null;
  const query = { producer: reading.producer, name: reading.wine_name, style: reading.style === 'unknown' ? undefined : reading.style };
  const { match } = await lookupCatalog(query, (text) => deps.search(text, signal));
  if (match.status !== 'match') return null;
  return lookupFrom(match.wine, needPhoto, deps, match.others);
}

/** Photos tried per wine: its own, then other shops' entries for the same wine. */
const PHOTO_TRIES = 4;

/** A matched catalog wine as the details a lookup gives, with a clean bottle photo when one of its entries has it. */
async function lookupFrom(w: CatalogWine, needPhoto: boolean, deps: CatalogDeps, others: CatalogWine[] = []): Promise<WineLookup> {
  let photo: WineLookup['photo'] = null;
  // Shops also show labels, gift boxes, lifestyle and phone shots: only a whole bottle will do.
  const seen = new Set<string>();
  const tries = [w, ...(needPhoto ? others : [])].filter((e) => e.image_url && !seen.has(e.image_url) && seen.add(e.image_url)).slice(0, PHOTO_TRIES);
  for (const e of tries) {
    const url = relayedImageUrl(e.image_url!);
    if (await deps.isBottle(url)) {
      photo = { url, pageUrl: e.image_source_page_url ?? '', siteName: siteName(e.image_source_domain, e.image_source_page_url), title: e.display_name ?? w.display_name ?? '' };
      break;
    }
  }

  const pageUrl = w.image_source_page_url ?? '';
  return {
    style: STYLES.includes(w.wine_type as WineStyle) ? (w.wine_type as WineStyle) : 'unknown',
    grapes: cleanGrapes(w.grapes),
    sourceUrl: pageUrl,
    sourceName: "Palate's wine catalog",
    photo,
    photoNote: '',
    candidates: [],
    about: null,
    fromCatalog: true,
    region: (w.region ?? '').replace(/\s+/g, ' ').trim(),
    country: (w.country ?? '').trim(),
    typicalPrice: w.min_usd_750,
  };
}

/** A bottle read off a shelf, looked up in the catalog: details and a bottle photo when it's a sure match. */
export async function catalogForShelfBottle(b: ShelfBottle, signal?: AbortSignal, deps?: CatalogDeps): Promise<ShelfCatalog | null> {
  const reading: LabelReading = {
    is_wine_label: true,
    producer: b.producer,
    wine_name: b.wine,
    vintage: b.vintage,
    country: b.country,
    region: b.region,
    grapes: [],
    style: b.style,
    confidence: 'high',
    uncertain: '',
  };
  const l = await catalogLookup(reading, false, signal, deps);
  if (!l) return null;
  return {
    photo: l.photo ? { url: l.photo.url, pageUrl: l.photo.pageUrl, siteName: l.photo.siteName } : null,
    style: l.style,
    grapes: l.grapes,
    region: l.region ?? '',
    country: l.country ?? '',
  };
}

/** A wine's full name as one string ("Renato Ratti Barolo Marcenasco"), identified in the catalog. */
export interface CatalogIdentity {
  /** The name split where the catalog's producer ends, keeping your spelling. */
  producer: string;
  name: string;
  details: ShelfCatalog;
}

/** Where the producer ends in a full name: the shortest start of it holding all the producer's words. */
export function splitProducer(full: string, catalogProducer: string): { producer: string; name: string } | null {
  const want = norm(catalogProducer)
    .split(' ')
    .filter((t) => t.length > 1 && !PRODUCER_FILLER.has(t));
  if (!want.length) return null;
  const words = full.split(/\s+/).filter(Boolean);
  for (let k = 1; k < words.length; k++) {
    const have = new Set(norm(words.slice(0, k).join(' ')).split(' '));
    if (want.every((t) => have.has(t))) return { producer: words.slice(0, k).join(' '), name: words.slice(k).join(' ') };
  }
  return null;
}
const PRODUCER_FILLER = new Set(['chateau', 'domaine', 'domaines', 'bodegas', 'bodega', 'tenuta', 'maison', 'weingut', 'de', 'di', 'del', 'du', 'des', 'la', 'le', 'les', 'et', 'fils', 'winery', 'estate', 'vineyards', 'cellars']);

/** The catalog's ids for a wine (its entry, then other shops' entries for the same wine), when it is a sure match. */
export async function catalogWineIds(producer: string, name: string, deps?: CatalogDeps): Promise<string[]> {
  const d = deps ?? DEFAULT_DEPS;
  if (!catalogConfigured && d === DEFAULT_DEPS) return [];
  const { match } = await lookupCatalog({ producer, name }, (text) => d.search(text));
  return match.status === 'match' ? [match.wine.wine_id, ...(match.others ?? []).map((o) => o.wine_id)] : [];
}

export async function catalogIdentify(full: string, deps?: CatalogDeps): Promise<CatalogIdentity | null> {
  const d = deps ?? DEFAULT_DEPS;
  if (!catalogConfigured && d === DEFAULT_DEPS) return null;
  const { match } = await lookupCatalog({ text: full }, (text) => d.search(text));
  if (match.status !== 'match') return null;
  const w = match.wine;
  const l = await lookupFrom(w, false, d);
  const split = splitProducer(full, w.producer ?? '') ?? { producer: '', name: full };
  return {
    ...split,
    details: {
      photo: l?.photo ? { url: l.photo.url, pageUrl: l.photo.pageUrl, siteName: l.photo.siteName } : null,
      style: l?.style ?? 'unknown',
      grapes: l?.grapes ?? cleanGrapes(w.grapes),
      region: l?.region ?? (w.region ?? ''),
      country: l?.country ?? (w.country ?? ''),
    },
  };
}
