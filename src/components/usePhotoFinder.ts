import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAllWines } from '../hooks';
import { hasApiKey } from '../lib/labelReader';
import { findPhotoFor, isFinding, keepCopy, photoQueue, subscribeFinding } from '../lib/photoFinder';

let running = false;
// Linked photos already tried this visit (one that's offline now is tried next visit).
const copyTried = new Set<string>();

/**
 * Runs while the app is open, one wine at a time: saves your own copy of photos still linked to
 * a shop's site, then looks up a photo for every wine still showing the silhouette.
 */
export function usePhotoFinder(): void {
  const wines = useAllWines();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!wines || running || !navigator.onLine) return;
    const linked = wines.find((w) => w.photo?.kind === 'remote' && !copyTried.has(w.id));
    const next = linked ? null : hasApiKey() ? photoQueue(wines)[0] : undefined;
    if (!linked && !next) return;
    running = true;
    // A short pause so opening the app (or saving a wine) isn't slowed down. When this one
    // is done the wines change (or the try is recorded) and the next one starts.
    const t = window.setTimeout(() => {
      const work = linked ? (copyTried.add(linked.id), keepCopy(linked)) : findPhotoFor(next!);
      void work.finally(() => {
        running = false;
        // Nothing changes in the database when no photo is found, so move the queue along here.
        setTick((n) => n + 1);
      });
    }, linked ? 300 : 1500);
    return () => {
      window.clearTimeout(t);
      if (!linked && next && !isFinding(next.id)) running = false;
      if (linked && !copyTried.has(linked.id)) running = false;
    };
  }, [wines, tick]);
}

/** True while a web photo is being looked up for this wine. */
export function useFindingPhoto(id: string | undefined): boolean {
  return useSyncExternalStore(subscribeFinding, () => (id ? isFinding(id) : false));
}
