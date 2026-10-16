import { db, updateWine } from '../db';
import type { Wine } from '../types';
import { photoFromFile, photoFromUrl, shownPhoto } from './image';
import { relayedImageUrl } from './labelClient';
import { originalImage, preferVintage, unsuitable } from './photoVintage';

export { photoYear, preferVintage, unsuitable, wrongVintage } from './photoVintage';

/**
 * Every bottle should show a real photo, without you having to look for one. Wines showing the
 * silhouette (no photo, only a camera snap, or a link to a shop's photo that's gone) are looked up
 * in the background, one at a time:
 *  1. Palate's wine catalog, Total Wine's product photos (the bottles in your imported stock) and
 *     photos found before: a sure match's photo is used straight away (free, a second). When it
 *     isn't sure, Claude picks from the likely entries' photos (about 2¢, a few seconds).
 *  2. Only then the web search (about 5¢, half a minute).
 * A photo Claude confirmed is saved for next time (learned_photos), so it's then a sure match.
 * A search that finds nothing is tried again after two weeks (or when the name changes); one that
 * was interrupted (app closed, no connection) is tried again soon.
 * Photos still linked to a shop's site are saved as your own copy, so they can't disappear.
 */

const KEY = 'palate.photoTries3'; // v3: Palate's catalog first (v2 tries never looked there)
const RETRY_AFTER = 14 * 24 * 60 * 60 * 1000;
/** After an interrupted or failed search (not a "nothing found"). */
const RETRY_SOON = 30 * 60 * 1000;

type Tries = Record<string, { at: number; sig: string; why?: string; soon?: boolean }>;

function loadTries(): Tries {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Tries;
  } catch {
    return {};
  }
}

function saveTry(id: string, sig: string, why?: string, soon = false): void {
  try {
    const tries = loadTries();
    tries[id] = { at: Date.now(), sig, why, ...(soon ? { soon } : {}) };
    localStorage.setItem(KEY, JSON.stringify(tries));
  } catch {
    /* private mode: tried again next visit */
  }
}

/** Searches that ran and found nothing; anything else (cancelled, offline, a busy moment) is tried again soon. */
const REAL_MISSES = ['no photo of this exact wine was found', 'no pages about this wine were found online', 'the pages found had no bottle photos that could be loaded'];

// Wines whose linked photo (on a shop's site) is gone: looked up again like a wine with no photo.
const gone = new Set<string>();

/** What the search is for; a change here means it's worth searching again. */
function signature(w: Wine): string {
  return [w.producer, w.name, w.vintage ?? '', w.region].map((s) => String(s).trim().toLowerCase()).join('|');
}

/** Showing the silhouette, with enough of a name to search for. */
export function needsPhoto(w: Wine): boolean {
  return (!shownPhoto(w.photo) || gone.has(w.id)) && Boolean(w.producer.trim() || w.name.trim());
}

/** Wines to look up now, newest first. */
export function photoQueue(wines: Wine[], now = Date.now(), tries: Tries = loadTries()): Wine[] {
  return wines
    .filter(needsPhoto)
    .filter((w) => {
      const t = tries[w.id];
      return !t || t.sig !== signature(w) || now - t.at > (t.soon ? RETRY_SOON : RETRY_AFTER);
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** "Domaine de la Bressande En Sazenay 2022 (Mercurey, France)" */
export function wineQuery(w: Wine): string {
  const place = [w.region, w.country].filter(Boolean).join(', ');
  return [w.producer, w.name, w.vintage ?? ''].filter(Boolean).join(' ') + (place ? ` (${place})` : '');
}

/** Why the last automatic search found nothing, if it didn't. */
export function lastMiss(w: Wine): string | null {
  const t = loadTries()[w.id];
  return t && t.sig === signature(w) && t.why ? t.why : null;
}

/** Bottle photos of a wine from the web, best first (Claude searches; see bottlePhotoClient). */
export async function findBottlePhotos(query: string, snap: Blob | null, signal?: AbortSignal, known: { url: string; site: string }[] = []) {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false as const, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./bottlePhotoClient')).findBottlePhotosWithClaude(apiKey, query, snap, signal, known);
}

// Which wines are being looked up right now, for "Finding a photo…".
const finding = new Set<string>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export function subscribeFinding(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const isFinding = (id: string) => finding.has(id);

/**
 * The wine's photo from Palate's catalog (with Total Wine's photos and earlier finds): a sure
 * match, or Claude's pick of its likely entries. `confirmed` when Claude picked it.
 */
async function fromCatalog(wine: Wine, snap: Blob | null, signal?: AbortSignal) {
  const { catalogPhotos } = await import('./catalog');
  const found = await catalogPhotos(wine.producer, wine.name, wine.style || undefined, signal, undefined, wine.vintage).catch(() => null);
  if (!found) return null;
  if (found.sure) return { pick: found.sure, confirmed: false };
  if (!found.maybe.length) return null;
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return null;
  const out = await (await import('./bottlePhotoClient')).pickBottlePhoto(apiKey, wineQuery(wine), found.maybe, snap, signal);
  return out.ok && out.matched ? { pick: out.photos[0], confirmed: true } : null;
}

/**
 * A photo Claude confirmed for this wine, saved for next time: the photo finder (and anyone
 * looking up the same wine) then finds it straight away, for free.
 */
async function learnPhoto(wine: Wine, pick: { url: string; pageUrl: string; siteName: string }): Promise<void> {
  const { signedInClient } = await import('./cloud');
  const sb = await signedInClient();
  if (!sb) return;
  await sb.from('learned_photos').insert({
    producer: wine.producer.trim(),
    name: wine.name.trim(),
    style: wine.style || null,
    image_url: originalImage(pick.url),
    page_url: pick.pageUrl,
    site: pick.siteName,
  }); // a photo already saved for this wine is turned down, which is fine
}

/** Look one wine up and put the photo in place. True if a photo was found. */
export async function findPhotoFor(wine: Wine, signal?: AbortSignal): Promise<boolean> {
  if (finding.has(wine.id)) return false;
  finding.add(wine.id);
  changed();
  try {
    // Your own snap, if there is one, is only used to check the photo is the same bottle.
    const snap = wine.photo?.kind === 'local' ? ((await db.photos.get(wine.photo.blobId))?.blob ?? null) : null;
    const catalog = await fromCatalog(wine, snap, signal).catch(() => null);
    if (signal?.aborted) return false;
    let pick = catalog?.pick ?? null;
    // Confirmed by Claude (not a sure catalog match, which is found again anyway): learn it.
    let learn = Boolean(catalog?.confirmed);
    // A catalog photo of another vintage or a magnum ("… 1993 1.5L" for your 2023) is kept for later; the web is tried first.
    let other = null as typeof pick;
    if (pick && unsuitable(pick, wine.vintage)) {
      other = pick;
      pick = null;
    }
    if (!pick) {
      const outcome = await findBottlePhotos(wineQuery(wine), snap, signal);
      if (signal?.aborted) return false;
      if (outcome.ok && outcome.matched) {
        const best = preferVintage(outcome.photos, wine.vintage)[0];
        // The web's best is no better than the catalog's? Keep the catalog's (already known to be this wine).
        if (!(other && unsuitable(best, wine.vintage))) {
          pick = best;
          learn = true;
        }
      }
      if (!pick && other) {
        pick = other;
        learn = false;
      }
      if (!pick) {
        const why = outcome.ok ? 'no photo of this exact wine was found' : outcome.reason;
        saveTry(wine.id, signature(wine), why, !REAL_MISSES.includes(why));
        return false;
      }
    }
    if (learn) void learnPhoto(wine, pick).catch(() => {});
    const photo = await photoFromUrl(pick.url, { name: pick.siteName, pageUrl: pick.pageUrl, title: pick.title });
    saveTry(wine.id, signature(wine));
    // Only if it still needs one (you may have changed it meanwhile).
    const now = await db.wines.get(wine.id);
    if (!now || (shownPhoto(now.photo) && !gone.has(wine.id))) return false;
    await updateWine(wine.id, { photo });
    gone.delete(wine.id);
    return true;
  } catch {
    saveTry(wine.id, signature(wine), 'something went wrong looking it up', true);
    return false;
  } finally {
    finding.delete(wine.id);
    changed();
  }
}

/**
 * A photo still linked to a shop's site, saved as your own copy (it syncs like your other
 * photos), so it can't disappear. If the link is already dead, the wine is looked up again.
 */
export async function keepCopy(wine: Wine): Promise<'kept' | 'gone' | 'later'> {
  const p = wine.photo;
  if (p?.kind !== 'remote') return 'kept';
  // Through the image relay, which lets the app read images from any site.
  const url = p.url.startsWith('https://images.weserv.nl/') ? p.url : relayedImageUrl(p.url);
  let res: Response;
  try {
    res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  } catch {
    return 'later'; // offline
  }
  const blob = res.ok ? await res.blob().catch(() => null) : null;
  if (res.status >= 400 && res.status < 500) {
    gone.add(wine.id);
    return 'gone';
  }
  if (!blob || !blob.type.startsWith('image/')) return 'later';
  const photo = await photoFromFile(blob, p.source);
  const now = await db.wines.get(wine.id);
  if (now?.photo?.kind === 'remote' && now.photo.url === p.url) await updateWine(wine.id, { photo });
  return 'kept';
}
