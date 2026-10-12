import type { Wine } from '../types';
import { canonicalGrape, findAppellation } from './appellations';
import { SHARE_TAGS, type ShareBlurb, type ShareTag } from './share';

/**
 * The friendly bits on the shared page, for people new to wine: a short taste tag ("Light &
 * silky"), one plain sentence and a few foods. Claude writes them for all the new wines in one
 * request when you share (blurbsClient.ts); a tag from the grapes stands in when it can't.
 */

/** The better-known area a wine comes from ("Burgundy" for Mercurey), or empty when the region already says it. */
export function areaOf(w: Pick<Wine, 'region' | 'name'>): string {
  const area = findAppellation(`${w.region} ${w.name}`)?.area ?? '';
  return area && area.toLowerCase() !== w.region.trim().toLowerCase() && !area.includes('(') ? area : '';
}

const has = (grapes: string[], ...names: string[]) => grapes.some((g) => names.includes(g));

/** A taste tag from the colour and grapes alone (free; used when Claude can't write one). */
export function tagFor(w: Pick<Wine, 'style' | 'grapes' | 'region' | 'name'>): ShareTag {
  if (w.style === 'sparkling') return 'Bubbly';
  if (w.style === 'dessert' || w.style === 'fortified') return 'Sweet';
  const named = w.grapes.map(canonicalGrape);
  const grapes = named.length ? named : (findAppellation(`${w.region} ${w.name}`)?.grapes ?? []);
  if (w.style === 'white' || w.style === 'orange') return has(grapes, 'Chardonnay', 'Viognier', 'Sémillon') ? 'Rich & creamy' : 'Crisp & fresh';
  if (w.style === 'rose') return 'Crisp & fresh';
  const first = grapes[0];
  if (has(grapes, 'Pinot Noir', 'Gamay') && !has(grapes, 'Cabernet Sauvignon', 'Syrah')) return 'Light & silky';
  if (first === 'Grenache' || first === 'Zinfandel') return 'Warm & spicy';
  if (first === 'Sangiovese' || first === 'Barbera' || first === 'Dolcetto') return 'Bright & juicy';
  return 'Bold & rich';
}

export type BlurbAsk = { producer: string; name: string; vintage: string; place: string; grapes: string[]; style: string; about: string };
export type Write = (asks: BlurbAsk[]) => Promise<{ ok: true; blurbs: (ShareBlurb | null)[] } | { ok: false; reason: string }>;

async function writeWithKey(asks: BlurbAsk[]) {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false as const, reason: 'no key' };
  return (await import('./blurbsClient')).writeBlurbsWithClaude(apiKey, asks);
}

/**
 * A blurb for every wine: kept from the last share when there is one, written by Claude for the
 * rest in one request, or just a tag from the grapes if that fails.
 */
export async function blurbsFor(wines: Wine[], kept: Record<string, ShareBlurb | undefined>, write: Write = writeWithKey): Promise<Record<string, ShareBlurb>> {
  const out: Record<string, ShareBlurb> = {};
  const missing = wines.filter((w) => {
    const k = kept[w.id];
    if (k?.line) out[w.id] = k;
    return !k?.line;
  });
  if (missing.length) {
    const asks = missing.map((w) => ({
      producer: w.producer,
      name: w.name,
      vintage: w.vintage === null ? '' : String(w.vintage),
      place: [w.region, w.country].filter(Boolean).join(', '),
      grapes: w.grapes,
      style: w.style ?? '',
      about: [w.take?.whatItIs, w.take?.taste].filter(Boolean).join(' ').slice(0, 600),
    }));
    const res = await write(asks).catch(() => ({ ok: false as const, reason: 'unexpected error' }));
    for (const [i, w] of missing.entries()) {
      const b = res.ok ? res.blurbs[i] : null;
      out[w.id] = b && SHARE_TAGS.includes(b.tag) ? b : { tag: tagFor(w), line: '', pairing: '' };
    }
  }
  return out;
}
