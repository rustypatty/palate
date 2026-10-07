import { db, updateWine } from '../db';
import type { Wine } from '../types';
import { photoFromUrl, shownPhoto } from './image';

/**
 * Every bottle should show a real photo from the web, without you having to look for one.
 * Wines showing the silhouette (no photo, or only a camera snap) are looked up online in the
 * background, one at a time, and the shop's photo of the same wine is put in place.
 * Each wine is tried once; it's tried again only if its name changes or after a while.
 */

const KEY = 'palate.photoTries2'; // v2: earlier tries used a search that couldn't get past shop sites
const RETRY_AFTER = 14 * 24 * 60 * 60 * 1000;

type Tries = Record<string, { at: number; sig: string; why?: string }>;

function loadTries(): Tries {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Tries;
  } catch {
    return {};
  }
}

function saveTry(id: string, sig: string, why?: string): void {
  try {
    const tries = loadTries();
    tries[id] = { at: Date.now(), sig, why };
    localStorage.setItem(KEY, JSON.stringify(tries));
  } catch {
    /* private mode: tried again next visit */
  }
}

/** What the search is for; a change here means it's worth searching again. */
function signature(w: Wine): string {
  return [w.producer, w.name, w.vintage ?? '', w.region].map((s) => String(s).trim().toLowerCase()).join('|');
}

/** Showing the silhouette, with enough of a name to search for. */
export function needsPhoto(w: Wine): boolean {
  return !shownPhoto(w.photo) && Boolean(w.producer.trim() || w.name.trim());
}

/** Wines to look up now, newest first. */
export function photoQueue(wines: Wine[], now = Date.now(), tries: Tries = loadTries()): Wine[] {
  return wines
    .filter(needsPhoto)
    .filter((w) => {
      const t = tries[w.id];
      return !t || t.sig !== signature(w) || now - t.at > RETRY_AFTER;
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

/** Look one wine up and put the photo in place. True if a photo was found. */
export async function findPhotoFor(wine: Wine, signal?: AbortSignal): Promise<boolean> {
  if (finding.has(wine.id)) return false;
  finding.add(wine.id);
  changed();
  try {
    // Your own snap, if there is one, is only used to check the web photo is the same bottle.
    const snap = wine.photo?.kind === 'local' ? ((await db.photos.get(wine.photo.blobId))?.blob ?? null) : null;
    const outcome = await findBottlePhotos(wineQuery(wine), snap, signal);
    if (signal?.aborted) return false;
    if (!outcome.ok || !outcome.matched) {
      saveTry(wine.id, signature(wine), outcome.ok ? 'no photo of this exact wine was found' : outcome.reason);
      return false;
    }
    const pick = outcome.photos[0];
    const photo = await photoFromUrl(pick.url, { name: pick.siteName, pageUrl: pick.pageUrl, title: pick.title });
    saveTry(wine.id, signature(wine));
    // Only if it still needs one (you may have changed it meanwhile).
    const now = await db.wines.get(wine.id);
    if (!now || shownPhoto(now.photo)) return false;
    await updateWine(wine.id, { photo });
    return true;
  } catch {
    saveTry(wine.id, signature(wine), 'something went wrong looking it up');
    return false;
  } finally {
    finding.delete(wine.id);
    changed();
  }
}
