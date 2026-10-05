import { savePhoto } from '../db';
import type { Photo, PhotoSource } from '../types';

const MAX_EDGE = 1400;

/**
 * Downscale a photo to a sensible size for on-device storage. Keeps the full
 * frame (no cropping) so necks and labels survive; the gallery handles fit.
 */
export async function resizeImage(file: Blob, maxEdge = MAX_EDGE): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  const source: CanvasImageSource & { width: number; height: number } = bitmap ?? (await loadImg(file));
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  // White under transparent PNGs so they don't turn black as JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  bitmap?.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', 0.86),
  );
  return { blob, width, height };
}

function loadImg(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file isn’t an image we can read.'));
    };
    img.src = url;
  });
}

/**
 * A photo taken with your own camera (or an early on-device photo with no source). The rule:
 * these are never shown — every bottle image comes from the web, or the silhouette.
 */
export function isCameraPhoto(photo: Photo | null | undefined): boolean {
  if (!photo) return false;
  return photo.source?.name === 'Your photo' || (photo.kind === 'local' && !photo.source);
}

/** The photo to show: web photos only. */
export function shownPhoto(photo: Photo | null | undefined): Photo | null {
  return photo && !isCameraPhoto(photo) ? photo : null;
}

export async function photoFromFile(file: Blob, source?: PhotoSource): Promise<Photo> {
  const { blob, width, height } = await resizeImage(file);
  const blobId = await savePhoto(blob, width, height);
  return { kind: 'local', blobId, source };
}

/**
 * Try to keep a copy of an online photo on the device (works offline in the store).
 * Many hosts block cross-origin downloads; in that case we keep a link instead.
 */
export async function photoFromUrl(url: string, source?: PhotoSource): Promise<Photo> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) throw new Error('not an image');
    return await photoFromFile(blob, source);
  } catch {
    return { kind: 'remote', url, source };
  }
}

export function isProbablyImageUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
