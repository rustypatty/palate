import { useEffect, useState } from 'react';

/**
 * Many product photos have wide empty margins, so the bottle looks small next to others.
 * When a photo has a plain background, crop it to the bottle (plus a little air). The crop
 * keeps the photo's own pixels, and is never tighter than MIN_HEIGHT source pixels, so a
 * small photo is only enlarged a little and stays sharp.
 */

const MIN_HEIGHT = 480; // the tallest bottle on screen is about 360 points: enough pixels to stay crisp
const PAD = 0.05;
const cache = new Map<string, Promise<string | null>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Blob URLs are our own; remote photos need CORS to be read (if not, we keep them as they are).
    if (!src.startsWith('blob:') && !src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function near(a: Uint8ClampedArray, i: number, bg: number[]): boolean {
  if (a[i + 3] < 24) return true; // transparent counts as background
  return Math.abs(a[i] - bg[0]) + Math.abs(a[i + 1] - bg[1]) + Math.abs(a[i + 2] - bg[2]) < 42;
}

async function trim(src: string): Promise<string | null> {
  const img = await loadImage(src);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (!W || !H) return null;

  // Find the bottle on a small copy.
  const scale = Math.min(1, 240 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) return null;
  sctx.drawImage(img, 0, 0, w, h);
  const data = sctx.getImageData(0, 0, w, h).data; // throws if the photo isn't readable

  // Only plain backgrounds: the four corners must agree.
  const px = (x: number, y: number) => (y * w + x) * 4;
  const corners = [px(1, 1), px(w - 2, 1), px(1, h - 2), px(w - 2, h - 2)];
  const bg = [data[corners[0]], data[corners[0] + 1], data[corners[0] + 2]];
  if (!corners.every((c) => near(data, c, bg))) return null;

  let top = h;
  let bottom = -1;
  let left = w;
  let right = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (near(data, px(x, y), bg)) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return null;

  // Back to full size, with a little air, and never tighter than MIN_HEIGHT pixels tall.
  let cy0 = top / scale;
  let cy1 = (bottom + 1) / scale;
  let cx0 = left / scale;
  let cx1 = (right + 1) / scale;
  const padY = (cy1 - cy0) * PAD;
  const padX = (cx1 - cx0) * PAD + padY;
  cy0 -= padY;
  cy1 += padY;
  cx0 -= padX;
  cx1 += padX;
  const minH = Math.min(H, MIN_HEIGHT);
  if (cy1 - cy0 < minH) {
    // Too few pixels to fill the frame sharply: keep more around it, with the bottle standing at the bottom.
    const k = minH / (cy1 - cy0);
    const mx = (cx0 + cx1) / 2;
    const halfW = ((cx1 - cx0) * k) / 2;
    cx0 = mx - halfW;
    cx1 = mx + halfW;
    cy0 = cy1 - minH;
    if (cy0 < 0) {
      cy1 -= cy0;
      cy0 = 0;
    }
  }
  const x0 = Math.max(0, Math.floor(cx0));
  const y0 = Math.max(0, Math.floor(cy0));
  const x1 = Math.min(W, Math.ceil(cx1));
  const y1 = Math.min(H, Math.ceil(cy1));
  // Not worth it unless it trims a real margin.
  if ((x1 - x0) * (y1 - y0) > W * H * 0.8) return null;

  const out = document.createElement('canvas');
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.getContext('2d')!.drawImage(img, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const transparent = data[corners[0] + 3] < 24;
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, transparent ? 'image/png' : 'image/jpeg', 0.92));
  return blob ? URL.createObjectURL(blob) : null;
}

/**
 * The photo with its empty margins trimmed, the original if it can't be, or undefined for
 * a moment while it's worked out (so the bottle doesn't visibly jump in size).
 */
export function useTrimmedPhoto(src: string | null): string | null | undefined {
  const [done, setDone] = useState<{ src: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    let job = cache.get(src);
    if (!job) {
      job = trim(src).catch(() => null);
      cache.set(src, job);
    }
    const finish = (url: string | null) => alive && setDone((d) => (d?.src === src ? d : { src, url }));
    job.then(finish);
    // Slow network: show the original rather than wait.
    const t = window.setTimeout(() => finish(null), 1500);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [src]);
  if (!src) return null;
  if (done?.src !== src) return undefined;
  return done.url ?? src;
}
