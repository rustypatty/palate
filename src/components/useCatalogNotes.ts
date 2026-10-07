import { useEffect } from 'react';
import { useAllWines } from '../hooks';
import { fillFromCatalog, noteKey, notesConfigured, wantsNote } from '../lib/catalogNotes';

// Keys already asked about this session: the catalog is checked again next time the app opens.
const asked = new Set<string>();

/** In the background, gives every wine without a description the catalog's one, when there is one (free). */
export function useCatalogNotes() {
  const all = useAllWines();
  const fresh = (all ?? []).filter((w) => wantsNote(w) && !asked.has(noteKey(w.producer, w.name)));
  const signature = fresh.map((w) => w.id).join(',');
  useEffect(() => {
    if (!notesConfigured || !fresh.length || !navigator.onLine) return;
    // Wait for a moment of quiet (an import adds wines one by one), then ask once for all of them.
    const timer = window.setTimeout(() => {
      for (const w of fresh) asked.add(noteKey(w.producer, w.name));
      void fillFromCatalog(fresh).catch(() => {
        // Offline or the catalog is busy: try again next time the app opens.
        for (const w of fresh) asked.delete(noteKey(w.producer, w.name));
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [signature]);
}
