import { useEffect, useState } from 'react';

/**
 * Many product photos have wide empty margins, so the bottle looks small next to others.
 * When a photo has a plain background, crop it to the bottle (plus a little air). The crop
 * keeps the photo's own pixels, and is never tighter than MIN_HEIGHT source pixels, so a
 * small photo is only enlarged a little and stays sharp.
 * The plain background itself (a shop's grey or white studio backdrop) is then cut away, so
 * the bottle stands on the page rather than in a box.
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

/** How far a pixel is from the background colour (0 = the same). */
function dist(a: Uint8ClampedArray, i: number, bg: number[]): number {
  return Math.abs(a[i] - bg[0]) + Math.abs(a[i + 1] - bg[1]) + Math.abs(a[i + 2] - bg[2]);
}

const CUT = 40; // this close to the backdrop's colour, and joined to the edge: backdrop
const SOFT = 90; // edge pixels up to this far are faded a little, for a smooth outline

/**
 * Cut the backdrop out: every pixel of the background's colour that joins up with the photo's
 * edge goes transparent (a white label inside the dark glass doesn't join up, so it stays).
 * The bottle's own outline is softened by a pixel. True if a real backdrop was found.
 */
export function cutBackdrop(px: Uint8ClampedArray, w: number, h: number, bg: number[]): boolean {
  const n = w * h;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const visit = (p: number) => {
    if (seen[p]) return;
    seen[p] = 1;
    if (px[p * 4 + 3] < 24 || dist(px, p * 4, bg) < CUT) queue[tail++] = p;
  };
  for (let x = 0; x < w; x++) {
    visit(x);
    visit((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    visit(y * w);
    visit(y * w + w - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    if (x > 0) visit(p - 1);
    if (x < w - 1) visit(p + 1);
    if (p >= w) visit(p - w);
    if (p < n - w) visit(p + w);
  }
  // Mostly backdrop or hardly any: not a bottle on a plain background, leave it be.
  if (tail < n * 0.15 || tail > n * 0.97) return false;
  const cut = new Uint8Array(n);
  for (let k = 0; k < tail; k++) cut[queue[k]] = 1;
  for (let p = 0; p < n; p++) {
    if (cut[p]) {
      px[p * 4 + 3] = 0;
      continue;
    }
    // Next to the cut-away backdrop and still close to its colour: part see-through.
    const x = p % w;
    const edge = (x > 0 && cut[p - 1]) || (x < w - 1 && cut[p + 1]) || (p >= w && cut[p - w]) || (p < n - w && cut[p + w]);
    if (!edge) continue;
    const d = dist(px, p * 4, bg);
    if (d < SOFT) px[p * 4 + 3] = Math.round((px[p * 4 + 3] * (d - CUT / 2)) / (SOFT - CUT / 2)) || 0;
  }
  return true;
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
  const transparent = data[corners[0] + 3] < 24;
  const out = document.createElement('canvas');
  out.width = x1 - x0;
  out.height = y1 - y0;
  const octx = out.getContext('2d', { willReadFrequently: true })!;
  octx.drawImage(img, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  // A coloured backdrop (not already see-through): cut it away.
  let cutOut = false;
  if (!transparent) {
    const pixels = octx.getImageData(0, 0, out.width, out.height);
    cutOut = cutBackdrop(pixels.data, out.width, out.height, bg);
    if (cutOut) octx.putImageData(pixels, 0, 0);
  }
  // Not worth it unless it trims a real margin or cuts the backdrop away.
  if (!cutOut && (x1 - x0) * (y1 - y0) > W * H * 0.8) return null;
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, transparent || cutOut ? 'image/png' : 'image/jpeg', 0.92));
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

/** Where the bottle sits in a photo, as fractions of its width and height. */
export interface BottleBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Natural width / height of the whole photo. */
  aspect: number;
}

const boxes = new Map<string, Promise<BottleBox | null>>();

/**
 * Measure a bottle's real outline once: anything not near-white (brightness under ~245)
 * and not transparent counts as bottle. Results are kept for the session, per photo.
 */
export function measureBottle(src: string): Promise<BottleBox | null> {
  let job = boxes.get(src);
  if (!job) {
    job = (async () => {
      const img = await loadImage(src);
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      if (!W || !H) return null;
      const scale = Math.min(1, 320 / Math.max(W, H));
      const w = Math.max(1, Math.round(W * scale));
      const h = Math.max(1, Math.round(H * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data; // throws for photos the browser can't read (CORS)
      let top = h;
      let bottom = -1;
      let left = w;
      let right = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (d[i + 3] < 24) continue;
          if ((d[i] + d[i + 1] + d[i + 2]) / 3 >= 245) continue;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
      if (bottom < 0 || bottom - top < h * 0.1) return null;
      return { left: left / w, top: top / h, right: (right + 1) / w, bottom: (bottom + 1) / h, aspect: W / H };
    })().catch(() => null);
    boxes.set(src, job);
  }
  return job;
}

/** The measured outline, null if it couldn't be measured, undefined while working. */
export function useBottleBox(src: string | null): BottleBox | null | undefined {
  const [done, setDone] = useState<{ src: string; box: BottleBox | null } | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    measureBottle(src).then((box) => alive && setDone({ src, box }));
    return () => {
      alive = false;
    };
  }, [src]);
  if (!src) return null;
  return done?.src === src ? done.box : undefined;
}
