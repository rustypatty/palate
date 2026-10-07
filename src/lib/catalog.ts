import { isBottleShot } from './likePhotos';
import { GRAPES, lookupCatalog, searchCatalogAt, type CatalogWine } from './catalogMatch';
import { norm } from './catalogNorm';
import { relayedImageUrl, type WineLookup } from './labelClient';
import type { LabelReading } from './labelReader';
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

/**
 * The snapped wine from the catalog, as the same details the web lookup gives. Null when the
 * catalog isn't sure (or can't be reached), or when a photo is needed and it has no clean bottle shot.
 */
export async function catalogLookup(
  reading: LabelReading,
  needPhoto: boolean,
  signal?: AbortSignal,
  deps: CatalogDeps = { search, isBottle: (url) => isBottleShot(url).catch(() => false) },
): Promise<WineLookup | null> {
  if (!catalogConfigured && deps.search === search) return null;
  if (!reading.is_wine_label || !(reading.producer.trim() || reading.wine_name.trim())) return null;
  const query = { producer: reading.producer, name: reading.wine_name, style: reading.style === 'unknown' ? undefined : reading.style };
  const { match } = await lookupCatalog(query, (text) => deps.search(text, signal));
  if (match.status !== 'match') return null;
  const w = match.wine;

  let photo: WineLookup['photo'] = null;
  if (w.image_url) {
    const url = relayedImageUrl(w.image_url);
    // Shops also show labels, gift boxes and lifestyle shots: only a whole bottle will do.
    if (await deps.isBottle(url)) {
      photo = { url, pageUrl: w.image_source_page_url ?? '', siteName: siteName(w.image_source_domain, w.image_source_page_url), title: w.display_name ?? '' };
    }
  }
  if (needPhoto && !photo) return null; // the web lookup also finds a photo

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
  };
}
