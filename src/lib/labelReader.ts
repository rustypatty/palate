import type { WineDraft, WineStyle } from '../types';

/**
 * Reads a wine label photo with Claude. Runs entirely in the browser with the
 * user's own API key (kept on this device only) — Palate has no server.
 */

const KEY_STORAGE = 'palate.anthropicKey';

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
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
