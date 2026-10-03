import type { Rating, Wine, WineStyle } from '../types';
import { STYLE_LABEL } from './constants';
import { matchesQuery } from './filters';
import { fold, tokens } from './text';

/**
 * In-store advisor: given what's on the shelf in front of you (typed, or scanned),
 * look back at your own history with that producer, grape, region, country and style.
 */

export type SignalKind = 'producer' | 'grape' | 'region' | 'country' | 'style';

export interface Counts {
  loved: number;
  liked: number;
  wouldnt: number;
  untasted: number;
}

export interface Signal {
  kind: SignalKind;
  value: string;
  wines: Wine[];
  counts: Counts;
  /** -1 (you dislike these) … 1 (you love these); null if none are rated. */
  score: number | null;
}

export type VerdictLevel = 'strong' | 'good' | 'mixed' | 'skip' | 'unknown';

export interface Verdict {
  level: VerdictLevel;
  title: string;
  detail: string;
}

export interface Advice {
  exact: Wine[];
  related: Wine[];
  signals: Signal[];
  verdict: Verdict;
  price: PriceContext | null;
}

export interface PriceContext {
  lovedMedian: number | null;
  wouldntMedian: number | null;
  note: string | null;
}

const RATING_VALUE: Record<Rating, number> = { loved: 1, liked: 0.5, wouldnt: -1 };

const WEIGHT: Record<SignalKind, number> = {
  producer: 3,
  grape: 2,
  region: 1.5,
  style: 0.75,
  country: 0.5,
};

const STYLE_WORDS: Record<string, WineStyle> = {
  red: 'red',
  rouge: 'red',
  tinto: 'red',
  rosso: 'red',
  white: 'white',
  blanc: 'white',
  bianco: 'white',
  blanco: 'white',
  rose: 'rose',
  rosado: 'rose',
  rosato: 'rose',
  sparkling: 'sparkling',
  champagne: 'sparkling',
  cava: 'sparkling',
  prosecco: 'sparkling',
  cremant: 'sparkling',
  brut: 'sparkling',
  orange: 'orange',
  port: 'fortified',
  porto: 'fortified',
  sherry: 'fortified',
  madeira: 'fortified',
  sauternes: 'dessert',
};

export function isSameWine(w: Wine, queryTokens: string[]): boolean {
  const name = w.name.trim();
  const producer = w.producer.trim();
  if (!name) return producer ? mentioned(producer, queryTokens) && queryTokens.length <= tokens(producer).length + 1 : false;
  return mentioned(name, queryTokens) && (!producer || mentioned(producer, queryTokens));
}

export function countRatings(wines: Wine[]): Counts {
  const c: Counts = { loved: 0, liked: 0, wouldnt: 0, untasted: 0 };
  for (const w of wines) c[w.rating ?? 'untasted']++;
  return c;
}

export function scoreOf(wines: Wine[]): number | null {
  const rated = wines.filter((w) => w.rating !== null);
  if (rated.length === 0) return null;
  return rated.reduce((s, w) => s + RATING_VALUE[w.rating!], 0) / rated.length;
}

// Words that don't identify a producer on their own ("Ridge Vineyards" → "ridge").
const GENERIC = new Set([
  'vineyard', 'vineyards', 'winery', 'wines', 'wine', 'estate', 'estates', 'cellars', 'cellar',
  'family', 'domaine', 'chateau', 'bodegas', 'bodega', 'cantina', 'tenuta', 'weingut', 'maison',
  'quinta', 'clos', 'the', 'de', 'du', 'des', 'la', 'le', 'les', 'di', 'del', 'della', 'y', 'and', 'et',
]);

/** True when every distinctive word of `value` appears in the query (query words may be partial, ≥3 chars). */
export function mentioned(value: string, queryTokens: string[]): boolean {
  const all = tokens(value);
  const distinctive = all.filter((t) => !GENERIC.has(t));
  const v = distinctive.length ? distinctive : all;
  if (v.length === 0) return false;
  return v.every((vt) =>
    queryTokens.some((qt) => qt === vt || (qt.length >= 3 && vt.startsWith(qt))),
  );
}

function groupBy(wines: Wine[], key: (w: Wine) => string[]): Map<string, { value: string; wines: Wine[] }> {
  const m = new Map<string, { value: string; wines: Wine[] }>();
  for (const w of wines) {
    for (const raw of key(w)) {
      const value = raw.trim();
      if (!value) continue;
      const k = fold(value);
      const e = m.get(k) ?? { value, wines: [] };
      e.wines.push(w);
      m.set(k, e);
    }
  }
  return m;
}

export function detectStyle(query: string): WineStyle | null {
  for (const t of tokens(query)) if (STYLE_WORDS[t]) return STYLE_WORDS[t];
  return null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function priceContext(wines: Wine[], price: number | null, fmt: (n: number) => string): PriceContext | null {
  const priced = (r: Rating) => wines.filter((w) => w.rating === r && w.price !== null).map((w) => w.price!);
  const lovedMedian = median(priced('loved'));
  const wouldntMedian = median(priced('wouldnt'));
  if (lovedMedian === null && wouldntMedian === null) return null;
  let note: string | null = null;
  if (price !== null && lovedMedian !== null) {
    const ratio = price / lovedMedian;
    if (ratio >= 1.5) note = `That’s well above the ${fmt(lovedMedian)} you typically pay for wines you love.`;
    else if (ratio <= 0.6) note = `That’s well below the ${fmt(lovedMedian)} you typically pay for wines you love.`;
    else note = `Right around the ${fmt(lovedMedian)} you typically pay for wines you love.`;
  }
  return { lovedMedian, wouldntMedian, note };
}

export function advise(
  wines: Wine[],
  input: { query: string; style?: WineStyle | null; price?: number | null },
  fmt: (n: number) => string = (n) => `$${Math.round(n)}`,
): Advice {
  const q = tokens(input.query);
  const byRating = (a: Wine, b: Wine) => (b.rating ? RATING_VALUE[b.rating] : -2) - (a.rating ? RATING_VALUE[a.rating] : -2);
  // The same wine: its cuvée name and producer are both on the label you typed.
  const exact = q.length ? wines.filter((w) => isSameWine(w, q)).sort(byRating) : [];
  // Looser: everything you typed appears somewhere in the wine (e.g. "ridge zin").
  const related = q.length
    ? wines.filter((w) => !exact.includes(w) && matchesQuery(w, input.query)).sort(byRating)
    : [];

  const signals: Signal[] = [];
  const add = (kind: SignalKind, groups: Map<string, { value: string; wines: Wine[] }>) => {
    for (const { value, wines: ws } of groups.values()) {
      if (mentioned(value, q)) {
        signals.push({ kind, value, wines: ws, counts: countRatings(ws), score: scoreOf(ws) });
      }
    }
  };
  if (q.length) {
    add('producer', groupBy(wines, (w) => [w.producer]));
    add('grape', groupBy(wines, (w) => w.grapes));
    add('region', groupBy(wines, (w) => [w.region]));
    add('country', groupBy(wines, (w) => [w.country]));
  }
  const style = input.style ?? detectStyle(input.query);
  if (style) {
    const ws = wines.filter((w) => w.style === style);
    if (ws.length) {
      signals.push({ kind: 'style', value: STYLE_LABEL[style], wines: ws, counts: countRatings(ws), score: scoreOf(ws) });
    }
  }
  // Drop a region that just repeats a country name (region left as "Portugal").
  const countries = new Set(signals.filter((s) => s.kind === 'country').map((s) => fold(s.value)));
  const deduped = signals.filter((s) => !(s.kind === 'region' && countries.has(fold(s.value))));
  const order: SignalKind[] = ['producer', 'grape', 'region', 'style', 'country'];
  deduped.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.wines.length - a.wines.length);

  return {
    exact,
    related,
    signals: deduped,
    verdict: verdictFor(exact, deduped),
    price: priceContext(wines, input.price ?? null, fmt),
  };
}

export function verdictFor(exact: Wine[], signals: Signal[]): Verdict {
  // A wine you've already rated is the strongest evidence there is.
  const ratedExact = exact.find((w) => w.rating !== null);
  if (ratedExact) {
    const label = [ratedExact.producer, ratedExact.name].filter(Boolean).join(' ');
    switch (ratedExact.rating) {
      case 'loved':
        return { level: 'strong', title: 'You loved this one', detail: `${label} is already in your collection as “Loved it”.` };
      case 'liked':
        return { level: 'good', title: 'You liked this one', detail: `${label} is in your collection as “Liked it”.` };
      default:
        return { level: 'skip', title: 'You said you wouldn’t buy it again', detail: `${label} is marked “Wouldn’t buy again”.` };
    }
  }

  let total = 0;
  let weight = 0;
  for (const s of signals) {
    if (s.score === null) continue;
    const rated = s.counts.loved + s.counts.liked + s.counts.wouldnt;
    const w = WEIGHT[s.kind] * Math.min(rated, 3) / 3;
    total += s.score * w;
    weight += w;
  }
  if (weight === 0) {
    return {
      level: 'unknown',
      title: 'No history yet',
      detail: signals.length
        ? 'You have related bottles, but none are rated yet.'
        : 'Nothing in your collection matches this producer, grape, or region.',
    };
  }
  const score = total / weight;
  // Thin evidence (e.g. one country match) shouldn't sound confident.
  const thin = weight < 1;
  if (score >= 0.6 && !thin) return { level: 'strong', title: 'Strong match', detail: 'Your history with similar bottles is very positive.' };
  if (score >= 0.25) return { level: 'good', title: thin ? 'Leaning yes' : 'Good bet', detail: 'You’ve mostly enjoyed bottles like this.' };
  if (score >= -0.2) return { level: 'mixed', title: 'Mixed record', detail: 'You’ve had hits and misses with bottles like this.' };
  return { level: 'skip', title: 'Probably skip', detail: 'Bottles like this haven’t worked for you.' };
}

export function describeCounts(c: Counts): string {
  const parts: string[] = [];
  if (c.loved) parts.push(`${c.loved} loved`);
  if (c.liked) parts.push(`${c.liked} liked`);
  if (c.wouldnt) parts.push(`${c.wouldnt} wouldn’t buy again`);
  if (c.untasted) parts.push(`${c.untasted} untasted`);
  return parts.join(' · ');
}
