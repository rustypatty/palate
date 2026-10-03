import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from './db';
import type { Photo, Wine } from './types';

export function useWines(): Wine[] | undefined {
  return useLiveQuery(() => db.wines.toArray(), []);
}

export function useWine(id: string | undefined): Wine | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.wines.get(id)) ?? null) : null), [id]);
}

// Object URLs for on-device photos, shared across tiles so scrolling the gallery
// doesn't re-decode the same blobs.
const objectUrls = new Map<string, string>();

export function usePhotoUrl(photo: Photo | null | undefined): string | null {
  const blobId = photo?.kind === 'local' ? photo.blobId : null;
  const [url, setUrl] = useState<string | null>(() => (blobId ? (objectUrls.get(blobId) ?? null) : null));

  useEffect(() => {
    if (!blobId) {
      setUrl(null);
      return;
    }
    const cached = objectUrls.get(blobId);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    db.photos.get(blobId).then((p) => {
      if (cancelled || !p) return;
      const u = URL.createObjectURL(p.blob);
      objectUrls.set(blobId, u);
      setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [blobId]);

  if (photo?.kind === 'remote') return photo.url;
  return url;
}

export function useDebounced<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatches(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return matches;
}
