import { db, updateWine } from '../db';
import type { Wine } from '../types';
import { photoFromUrl, shownPhoto } from './image';
import type { LabelReading } from './labelReader';

/**
 * Every bottle should show a real photo from the web, without you having to look for one.
 * Wines showing the silhouette (no photo, or only a camera snap) are looked up online in the
 * background, one at a time, and the shop's photo of the same wine is put in place.
 * Each wine is tried once; it's tried again only if its name changes or after a while.
 */

const KEY = 'palate.photoTries';
const RETRY_AFTER = 14 * 24 * 60 * 60 * 1000;
export const PHOTO_FIND_COST = '~8¢';

type Tries = Record<string, { at: number; sig: string }>;

function loadTries(): Tries {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Tries;
  } catch {
    return {};
  }
}

function saveTry(id: string, sig: string): void {
  try {
    const tries = loadTries();
    tries[id] = { at: Date.now(), sig };
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

function toReading(w: Wine): LabelReading {
  return {
    is_wine_label: true,
    producer: w.producer,
    wine_name: w.name,
    vintage: w.vintage === null ? '' : String(w.vintage),
    country: w.country,
    region: w.region,
    grapes: w.grapes,
    style: w.style ?? 'unknown',
    confidence: 'high',
    uncertain: '',
  };
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
    const { lookUpWine } = await import('./labelReader');
    // Your own snap, if there is one, is only used to check the web photo is the same bottle.
    const snap = wine.photo?.kind === 'local' ? ((await db.photos.get(wine.photo.blobId))?.blob ?? null) : null;
    const outcome = await lookUpWine(toReading(wine), snap, signal);
    if (signal?.aborted) return false;
    saveTry(wine.id, signature(wine));
    if (!outcome.ok) return false;
    const pick = outcome.lookup.photo ?? outcome.lookup.candidates[0] ?? null;
    if (!pick) return false;
    const photo = await photoFromUrl(pick.url, { name: pick.siteName, pageUrl: pick.pageUrl, title: pick.title });
    // Only if it still needs one (you may have changed it meanwhile).
    const now = await db.wines.get(wine.id);
    if (!now || shownPhoto(now.photo)) return false;
    const extra = !now.about && outcome.lookup.about ? { about: outcome.lookup.about } : {};
    await updateWine(wine.id, { photo, ...extra });
    return true;
  } catch {
    saveTry(wine.id, signature(wine));
    return false;
  } finally {
    finding.delete(wine.id);
    changed();
  }
}
