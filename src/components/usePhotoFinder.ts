import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAllWines } from '../hooks';
import { hasApiKey } from '../lib/labelReader';
import { findPhotoFor, isFinding, photoQueue, subscribeFinding } from '../lib/photoFinder';

let running = false;

/** Runs while the app is open: looks up a web photo for every wine still showing the silhouette. */
export function usePhotoFinder(): void {
  const wines = useAllWines();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!wines || running || !hasApiKey() || !navigator.onLine) return;
    const next = photoQueue(wines)[0];
    if (!next) return;
    running = true;
    // A short pause so opening the app (or saving a wine) isn't slowed down. When this one
    // is done the wines change (or the try is recorded) and the next one starts.
    const t = window.setTimeout(() => {
      findPhotoFor(next).finally(() => {
        running = false;
        // Nothing changes in the database when no photo is found, so move the queue along here.
        setTick((n) => n + 1);
      });
    }, 1500);
    return () => {
      window.clearTimeout(t);
      if (!isFinding(next.id)) running = false;
    };
  }, [wines, tick]);
}

/** True while a web photo is being looked up for this wine. */
export function useFindingPhoto(id: string | undefined): boolean {
  return useSyncExternalStore(subscribeFinding, () => (id ? isFinding(id) : false));
}
