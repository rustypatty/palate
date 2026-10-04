import type { Rating, Wine, WineStyle } from '../types';
import { canonicalGrape, factsFromText } from './appellations';
import { STYLE_LABEL } from './constants';
import { matchesQuery } from './filters';
import { fold, tokens } from './text';

/**
 * In-store advisor: given what's on the shelf in front of you (typed, or scanned),
 * look back at your own history with that producer, grape, region, country and style.
 */

export type SignalKind = 'producer' | 'grape' | 'region' | 'area' | 'country' | 'style';

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
  /** True when the match rests on what the appellation is usually made from, not a named grape. */
  inferred?: boolean;
}

export type VerdictLevel = 'strong' | 'good' | 'mixed' | 'skip' | 'unknown';

export interface Verdict {
  level: VerdictLevel;
  title: string;
  detail: string;
  /** -1 … 1, the weighted average behind the verdict; null with no rated evidence. */
  score: number | null;
  /** How much rated evidence there is (0 = none, ~3+ = plenty). */
  weight: number;
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

export const RATING_VALUE: Record<Rating, number> = { loved: 1, liked: 0.5, wouldnt: -1 };

export const WEIGHT: Record<SignalKind, number> = {
  producer: 3,
  grape: 2,
  region: 1.5,
  area: 1,
  style: 0.75,
  country: 0.5,
};

const RELATED_WEIGHT = 2;

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

export function isSameWine(w: Wine, queryTokens: string[], partial = true): boolean {
  const name = w.name.trim();
  const producer = w.producer.trim();
  // Without a producer it can't be told apart from any other "Riesling".
  if (!producer) return false;
  if (!name) return mentioned(producer, queryTokens, partial) && queryTokens.length <= tokens(producer).length + 1;
  return mentioned(name, queryTokens, partial) && mentioned(producer, queryTokens, partial);
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
export function mentioned(value: string, queryTokens: string[], partial = true): boolean {
  // "Clos Saint Michel (Mousset)": the bracketed part is optional.
  const all = tokens(value.replace(/\([^)]*\)/g, ' '));
  const distinctive = all.filter((t) => !GENERIC.has(t));
  const v = distinctive.length ? distinctive : all;
  if (v.length === 0) return false;
  // Partial words ("chateaun") help when typing; store listings use whole words only.
  return v.every((vt) => queryTokens.some((qt) => qt === vt || (partial && qt.length >= 3 && vt.startsWith(qt))));
}

export function groupBy(wines: Wine[], key: (w: Wine) => string[]): Map<string, { value: string; wines: Wine[] }> {
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

/** What your wines imply beyond their own fields: wider area, and grapes canonicalised (or the appellation's usual ones). */
export function wineFacts(w: Wine): { area: string; country: string; grapes: string[]; grapesInferred: boolean } {
  const f = factsFromText(`${w.region} ${w.name}`);
  const own = w.grapes.map(canonicalGrape).filter(Boolean);
  return {
    area: f.area,
    country: w.country || f.country,
    grapes: own.length ? own : f.grapes,
    grapesInferred: own.length === 0 && f.grapes.length > 0,
  };
}

export interface Groups {
  producer: Map<string, { value: string; wines: Wine[] }>;
  grape: Map<string, { value: string; wines: Wine[] }>;
  region: Map<string, { value: string; wines: Wine[] }>;
  area: Map<string, { value: string; wines: Wine[] }>;
  country: Map<string, { value: string; wines: Wine[] }>;
}

export function groupWines(wines: Wine[]): Groups {
  const facts = new Map(wines.map((w) => [w, wineFacts(w)]));
  return {
    producer: groupBy(wines, (w) => [w.producer]),
    grape: groupBy(wines, (w) => facts.get(w)!.grapes),
    region: groupBy(wines, (w) => [w.region]),
    area: groupBy(wines, (w) => [facts.get(w)!.area]),
    country: groupBy(wines, (w) => [facts.get(w)!.country]),
  };
}

export interface AdviceInput {
  query: string;
  style?: WineStyle | null;
  price?: number | null;
  /** Match partial words (typing in the store). Off for store listings. Default on. */
  partial?: boolean;
}

/**
 * Precomputes your history once, then judges any number of bottles the same way:
 * the in-store check, store picks and the taste summary all go through this.
 */
export function makeAdvisor(wines: Wine[], fmt: (n: number) => string = (n) => `$${Math.round(n)}`) {
  const groups = groupWines(wines);
  const byRating = (a: Wine, b: Wine) => (b.rating ? RATING_VALUE[b.rating] : -2) - (a.rating ? RATING_VALUE[a.rating] : -2);
  const price = (p: number | null) => priceContext(wines, p, fmt);

  function advise(input: AdviceInput): Advice {
    const partial = input.partial ?? true;
    const q = tokens(input.query);
    const facts = factsFromText(input.query);
    const has = (value: string) => mentioned(value, q, partial);
    // The same wine: its cuvée name and producer are both on the label you typed.
    const exact = q.length ? wines.filter((w) => isSameWine(w, q, partial)).sort(byRating) : [];
    // Looser: everything you typed appears somewhere in the wine (e.g. "ridge zin").
    const related = q.length && partial ? wines.filter((w) => !exact.includes(w) && matchesQuery(w, input.query)).sort(byRating) : [];

    // Your reds say nothing about a white from the same place: when the colour is
    // known, only wines of that colour (or unknown colour) count as evidence.
    const style = input.style ?? detectStyle(input.query) ?? facts.style;
    const sameStyle = (ws: Wine[]) => (style ? ws.filter((w) => !w.style || w.style === style) : ws);

    const signals: Signal[] = [];
    const push = (kind: SignalKind, value: string, all: Wine[], inferred = false) => {
      const ws = kind === 'style' ? all : sameStyle(all);
      if (ws.length) signals.push({ kind, value, wines: ws, counts: countRatings(ws), score: scoreOf(ws), ...(inferred ? { inferred } : {}) });
    };
    if (q.length) {
      for (const { value, wines: ws } of groups.producer.values()) if (has(value)) push('producer', value, ws);
      const namedGrapes = new Set(facts.namedGrapes.map(fold));
      const usualGrapes = new Set(facts.grapesInferred ? facts.grapes.map(fold) : []);
      for (const [key, { value, wines: ws }] of groups.grape) {
        if (namedGrapes.has(key) || has(value)) push('grape', value, ws);
        else if (usualGrapes.has(key)) push('grape', value, ws, true);
      }
      for (const { value, wines: ws } of groups.region.values()) if (has(value)) push('region', value, ws);
      for (const [key, { value, wines: ws }] of groups.area) if (key === fold(facts.area) || has(value)) push('area', value, ws);
      for (const [key, { value, wines: ws }] of groups.country) if (key === fold(facts.country) || has(value)) push('country', value, ws);
    }
    if (style) {
      const ws = wines.filter((w) => w.style === style);
      if (ws.length) push('style', STYLE_LABEL[style], ws);
    }
    // Drop a region that just repeats a country name (region left as "Portugal"),
    // and an area that adds no wines beyond the matching regions.
    const countries = new Set(signals.filter((s) => s.kind === 'country').map((s) => fold(s.value)));
    const inRegions = new Set(signals.filter((s) => s.kind === 'region').flatMap((s) => s.wines));
    const deduped = signals.filter(
      (s) => !(s.kind === 'region' && countries.has(fold(s.value))) && !(s.kind === 'area' && s.wines.every((w) => inRegions.has(w))),
    );
    const order: SignalKind[] = ['producer', 'grape', 'region', 'area', 'style', 'country'];
    deduped.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.wines.length - a.wines.length);

    return { exact, related, signals: deduped, verdict: verdictFor(exact, deduped, related), price: price(input.price ?? null) };
  }

  return { advise, groups };
}

export function advise(wines: Wine[], input: AdviceInput, fmt: (n: number) => string = (n) => `$${Math.round(n)}`): Advice {
  return makeAdvisor(wines, fmt).advise(input);
}

export function verdictFor(exact: Wine[], signals: Signal[], related: Wine[] = []): Verdict {
  // A wine you've already rated is the strongest evidence there is.
  const ratedExact = exact.find((w) => w.rating !== null);
  if (ratedExact) {
    const label = [ratedExact.producer, ratedExact.name].filter(Boolean).join(' ');
    switch (ratedExact.rating) {
      case 'loved':
        return { level: 'strong', title: 'You loved this one', detail: `${label} is already in your collection as “Loved it”.`, score: 1, weight: 3 };
      case 'liked':
        return { level: 'good', title: 'You liked this one', detail: `${label} is in your collection as “Liked it”.`, score: 0.5, weight: 3 };
      default:
        return { level: 'skip', title: 'You said you wouldn’t buy it again', detail: `${label} is marked “Wouldn’t buy again”.`, score: -1, weight: 3 };
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
  // Wines that match everything you typed (e.g. "chateauneuf") count too, even
  // when the words don't name a whole producer, grape or region.
  const relatedScore = scoreOf(related);
  if (relatedScore !== null) {
    const rated = related.filter((w) => w.rating !== null).length;
    const w = RELATED_WEIGHT * Math.min(rated, 3) / 3;
    total += relatedScore * w;
    weight += w;
  }
  if (weight === 0) {
    return {
      level: 'unknown',
      title: 'No history yet',
      detail: signals.length || related.length
        ? 'You have related bottles, but none are rated yet.'
        : 'Nothing in your collection matches this producer, grape, or region.',
      score: null,
      weight: 0,
    };
  }
  const score = total / weight;
  // Thin evidence (e.g. one country match) shouldn't sound confident.
  const thin = weight < 1;
  const v = { score, weight };
  if (score >= 0.6 && !thin) return { level: 'strong', title: 'Strong match', detail: 'Your history with similar bottles is very positive.', ...v };
  if (score >= 0.25) return { level: 'good', title: thin ? 'Leaning yes' : 'Good bet', detail: 'You’ve mostly enjoyed bottles like this.', ...v };
  if (score >= -0.2) return { level: 'mixed', title: 'Mixed record', detail: 'You’ve had hits and misses with bottles like this.', ...v };
  return { level: 'skip', title: 'Probably skip', detail: 'Bottles like this haven’t worked for you.', ...v };
}

export function describeCounts(c: Counts): string {
  const parts: string[] = [];
  if (c.loved) parts.push(`${c.loved} loved`);
  if (c.liked) parts.push(`${c.liked} liked`);
  if (c.wouldnt) parts.push(`${c.wouldnt} wouldn’t buy again`);
  if (c.untasted) parts.push(`${c.untasted} untasted`);
  return parts.join(' · ');
}
