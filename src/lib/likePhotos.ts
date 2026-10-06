import { measureBottle } from '../components/useTrimmedPhoto';
import { db, updateWine } from '../db';
import type { LikeBottle } from '../types';
import { bottlePhoto, bottleTitle } from './likeThis';
import { storeById, type StoreId } from './stores';

/**
 * Photos for "Bottles like this": only real bottle shots. Stores sometimes show just the
 * front label; those are replaced by a bottle photo of the same wine:
 *  1. the store's own photo, when it really is a bottle (free);
 *  2. else the bottle photos on that wine's store pages, checked by Claude (about 2¢);
 *  3. else a web search for one (about 12¢).
 * Each bottle is settled once and the result saved with the search.
 */

/** A whole bottle stands tall: its outline is at least about twice as high as wide. A label is wide. */
export async function isBottleShot(url: string): Promise<boolean> {
  const box = await measureBottle(url);
  if (!box) return false;
  const shape = (box.bottom - box.top) / (box.right - box.left) / box.aspect;
  return shape >= 2.2;
}

const running = new Set<string>();

export const needsPhotoCheck = (bottles: LikeBottle[] | undefined) => Boolean(bottles?.some((b) => !b.photoChecked));

/** Settle the photos of a wine's "Bottles like this". Runs once at a time per wine. */
export async function settleLikePhotos(wineId: string): Promise<void> {
  if (running.has(wineId)) return;
  running.add(wineId);
  try {
    const wine = await db.wines.get(wineId);
    const cache = wine?.likeThis;
    if (!cache || !needsPhotoCheck(cache.bottles)) return;
    const { findBottlePhotos } = await import('./photoFinder');

    const settled = new Map<string, LikeBottle['image']>();
    const todo = cache.bottles.filter((b) => !b.photoChecked);
    const work = async (b: LikeBottle) => {
      const store = bottlePhoto(b);
      if (store && (await isBottleShot(store.url).catch(() => false))) {
        settled.set(b.key, store);
        return;
      }
      const name = bottleTitle(b.producer, b.wine, b.vintage);
      const place = [b.region, b.country].filter(Boolean).join(', ');
      const known = b.offers.map((o) => ({ url: o.url, site: storeById(o.storeId as StoreId)?.name ?? o.storeId }));
      const out = await findBottlePhotos(`${name}${place ? ` (${place})` : ''}`, null, undefined, known);
      if (!out.ok && /key|credit|switched off/i.test(out.reason)) throw new Error(out.reason); // try again later
      const best = out.ok && out.matched ? out.photos[0] : null;
      settled.set(b.key, best ? { url: best.url, pageUrl: best.pageUrl, siteName: best.siteName } : null);
    };
    // A few at a time.
    const queue = [...todo];
    await Promise.all(
      [0, 1, 2].map(async () => {
        for (let b = queue.shift(); b; b = queue.shift()) await work(b).catch(() => undefined);
      }),
    );
    if (!settled.size) return;

    // Save onto the same search (unless a new one replaced it meanwhile).
    const now = await db.wines.get(wineId);
    if (!now?.likeThis || now.likeThis.at !== cache.at) return;
    const bottles = now.likeThis.bottles.map((b) => (settled.has(b.key) ? { ...b, image: settled.get(b.key)!, photoChecked: true } : b));
    await updateWine(wineId, { likeThis: { ...now.likeThis, bottles } });
  } finally {
    running.delete(wineId);
  }
}
