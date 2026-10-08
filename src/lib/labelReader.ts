import type { WineDraft, WineStyle } from '../types';
import { SERVER_KEY, serverKeyReady } from './serverKey';

/**
 * Reads a wine label photo with Claude, in the browser, with your own API key: saved on
 * this device, or held on Palate's server (see serverKey.ts).
 */

const KEY_STORAGE = 'palate.anthropicKey';

/** The key saved in this browser, if any. */
export function getDeviceKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

/** The key Claude requests use: this device's, else the server's stand-in, else ''. */
export function getApiKey(): string {
  return getDeviceKey() || (serverKeyReady() ? SERVER_KEY : '');
}

/** Remove anything a copy-paste can drag along: spaces, line breaks, invisible characters, quotes. */
export function normalizeApiKey(raw: string): string {
  return raw.replace(/[\s\u200B-\u200D\u2060\uFEFF]+/g, '').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
}

/** Catch common mix-ups before asking Anthropic, so the message says what's actually wrong. */
export function apiKeyProblem(key: string): string | null {
  if (/…|\.\.\.|\*{3,}/.test(key)) {
    return 'That’s the shortened key shown in the Anthropic Console list, not the full key. Create a new key and tap Copy right away — the full key is only shown once.';
  }
  if (key.startsWith('sk-ant-admin')) return 'That’s an Admin key. Create a regular API key (Settings → API keys) instead.';
  if (/^sk-ant-o[a-z]t/.test(key)) return 'That’s a sign-in token, not an API key. Create an API key at console.anthropic.com (Settings → API keys).';
  if (!key.startsWith('sk-ant-api')) return 'That doesn’t look like an Anthropic API key — they start with “sk-ant-api”.';
  if (key.length < 80) return 'That key looks cut off — part of it may not have been copied. Copy the whole key again.';
  return null;
}

export function setApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, normalizeApiKey(key));
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage unavailable */
  }
}

export const hasApiKey = () => getApiKey().length > 0;

export interface LabelReading {
  is_wine_label: boolean;
  producer: string;
  wine_name: string;
  vintage: string;
  country: string;
  region: string;
  grapes: string[];
  style: WineStyle | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  uncertain: string;
}

export class LabelReadError extends Error {}

// The Anthropic SDK is loaded on first use so it doesn't slow down opening the app.
export async function readLabel(photo: Blob, signal?: AbortSignal): Promise<LabelReading> {
  const apiKey = getApiKey();
  if (!apiKey) throw new LabelReadError('Add your Anthropic API key on the My palate page to read labels.');
  return (await import('./labelClient')).readLabelWithClaude(apiKey, photo, signal);
}

export type { LookupOutcome, WineLookup } from './labelClient';

/** Confirms style and grapes online and finds a matching clean bottle photo. Says why when it can't. */
export async function lookUpWine(reading: LabelReading, photo: Blob | null, signal?: AbortSignal) {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false as const, reason: 'no Anthropic API key saved' };
  if (!reading.is_wine_label || !(reading.producer || reading.wine_name)) return { ok: false as const, reason: 'the producer or wine name couldn’t be read' };
  return (await import('./labelClient')).lookUpWineWithClaude(apiKey, reading, photo, signal);
}

/**
 * After a label snap: Palate's wine catalog first (free, a second or two), and only when it isn't
 * sure, the web lookup (about a minute). needPhoto: a catalog match counts only with a bottle photo.
 */
export async function lookUpLabel(reading: LabelReading, photo: Blob | null, needPhoto = true, signal?: AbortSignal) {
  const fromCatalog = await import('./catalog')
    .then((c) => c.catalogLookup(reading, needPhoto, signal))
    .catch(() => null);
  if (fromCatalog) return { ok: true as const, lookup: fromCatalog };
  return lookUpWine(reading, photo, signal);
}

/** The reading with style and grapes replaced by what was confirmed online. */
export function withLookup(r: LabelReading, l: { style: LabelReading['style']; grapes: string[] } | null): LabelReading {
  if (!l) return r;
  return { ...r, style: l.style !== 'unknown' ? l.style : r.style, grapes: l.grapes.length ? l.grapes : r.grapes };
}

export async function testApiKey(key: string): Promise<true | string> {
  return (await import('./labelClient')).testApiKey(key);
}

/** Turns a reading into add-form fields. */
export function readingToDraft(r: LabelReading): Partial<WineDraft> {
  const v = r.vintage.trim().toUpperCase();
  const year = /^(19|20)\d{2}$/.test(v) ? Number(v) : null;
  return {
    producer: r.producer.trim(),
    name: r.wine_name.trim(),
    vintage: v === 'NV' ? 'NV' : year,
    country: r.country.trim(),
    region: r.region.trim(),
    grapes: r.grapes.map((g) => g.trim()).filter(Boolean),
    style: r.style === 'unknown' ? null : (r.style as WineStyle),
  };
}

/** Text for the in-store search box: what you'd have typed from the label. */
export function readingToQuery(r: LabelReading): string {
  return [r.producer, r.wine_name, r.vintage, r.region, ...r.grapes].map((s) => s.trim()).filter(Boolean).join(' ');
}
