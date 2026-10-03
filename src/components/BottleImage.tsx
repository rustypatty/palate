import { useState } from 'react';
import { usePhotoUrl } from '../hooks';
import type { Photo } from '../types';

export function BottlePlaceholder({ size = 56 }: { size?: number }) {
  return (
    <div className="bottle-placeholder" aria-hidden="true">
      <svg width={size * 0.42} height={size * 1.4} viewBox="0 0 30 100" fill="currentColor">
        <path d="M11 2h8v22c0 4 7 9 7 20v50a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V44c0-11 7-16 7-20V2z" />
      </svg>
    </div>
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
export function BottleImage({ photo, alt, eager = false }: { photo: Photo | null | undefined; alt: string; eager?: boolean }) {
  const url = usePhotoUrl(photo);
  const [failed, setFailed] = useState<string | null>(null);
  if (!photo) return <BottlePlaceholder />;
  if (!url) return null; // on-device photo still loading
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
