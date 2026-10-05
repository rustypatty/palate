import { useState } from 'react';
import { usePhotoUrl } from '../hooks';
import { shownPhoto } from '../lib/image';
import type { Photo } from '../types';
import { useTrimmedPhoto } from './useTrimmedPhoto';

/** No photo: a minimal bottle silhouette standing in the tile. */
export function BottlePlaceholder(_props: { size?: number } = {}) {
  return (
    <div className="bottle-placeholder" aria-hidden="true">
      <BottleSilhouette />
    </div>
  );
}

export function BottleSilhouette() {
  return (
    <svg viewBox="0 0 40 140" aria-hidden="true">
      <path d="M16 2h8v36c0 7 11 12 11 25v70a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V63c0-13 11-18 11-25z" fill="#ddd2c5" />
      <rect x="5" y="84" width="30" height="26" fill="#e9e0d4" />
    </svg>
  );
}

export function BottleGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size * 0.42} height={size} viewBox="0 0 30 100" fill="currentColor" aria-hidden="true">
      <path d="M11 2h8v22c0 4 7 9 7 20v50a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V44c0-11 7-16 7-20V2z" />
    </svg>
  );
}

/** A full bottle, letterboxed inside its tile (never cropped). */
export function BottleImage({ photo: given, alt, eager = false }: { photo: Photo | null | undefined; alt: string; eager?: boolean }) {
  // Camera photos never show: the silhouette stands in until a web photo is found.
  const photo = shownPhoto(given);
  const original = usePhotoUrl(photo);
  const url = useTrimmedPhoto(original);
  const [failed, setFailed] = useState<string | null>(null);
  if (!photo) return <BottlePlaceholder />;
  if (!url) return null; // on-device photo still loading, or being trimmed
  if (failed === url) return <BottlePlaceholder />;
  return (
    <img
      className="bottle"
      src={url}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setFailed(url)}
    />
  );
}
