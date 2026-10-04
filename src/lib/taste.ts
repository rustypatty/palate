import type { Wine, WineStyle } from '../types';
import { countRatings, groupWines, RATING_VALUE, scoreOf, type Counts, type SignalKind } from './insights';
import { fold } from './text';

/**
 * Your taste, worked out from your ratings with the same scoring the in-store
 * check uses (Loved +1, Liked +0.5, Wouldn't buy again −1), so they agree.
 */

/** Below this many rated wines, suggestions would be guesswork. */
export const MIN_RATED = 5;

export interface Affinity {
  kind: SignalKind;
  value: string;
  /** −1 … 1 */
  score: number;
  rated: number;
  counts: Counts;
  /** score scaled by how much evidence there is (up to 3 rated wines). */
  strength: number;
}

export interface TasteProfile {
  rated: number;
  enough: boolean;
  likes: Affinity[];
  dislikes: Affinity[];
  style: WineStyle | null;
  price: { low: number; high: number } | null;
  /** Words from your own notes, on wines you enjoyed and ones you didn't. */
  notesLiked: string[];
  notesDisliked: string[];
  /** Things you said you're after, quoted from your notes. */
  wishes: string[];
  summary: string[];
}

// Phrases people use about wine, longest first so "very dry" wins over "dry".
const NOTE_WORDS: [string, RegExp][] = [
  ['little fruit', /\b(little|not much|no) fruit\b/],
  ['no tannin grip', /\bno (gripping )?tannins?\b|\blacks? (tannin|grip)/],
  ['gripping tannins', /\bgripp(ing|y) tannins?\b|\bgood tannins?\b/],
  ['very dry', /\bvery dry\b/],
  ['dark fruit', /\bdark fruits?\b/],
  ['full-bodied', /\bfull[- ]bodied\b/],
  ['fruit-forward', /\bfruit[- ]forward\b/],
  ['earthy', /\bearth(y|iness)\b/],
  ['jammy', /\bjammy\b/],
  ['oaky', /\boak(y|ed)\b/],
  ['buttery', /\bbutter(y)?\b/],
  ['fruity', /\bfruity\b/],
  ['bold', /\bbold\b/],
  ['smooth', /\bsmooth\b/],
  ['silky', /\bsilky\b/],
  ['velvety', /\bvelvety\b/],
  ['juicy', /\bjuicy\b/],
  ['bright', /\bbright\b/],
  ['crisp', /\bcrisp\b/],
  ['rich', /\brich\b/],
  ['light', /\blight[- ]?(bodied)?\b/],
  ['spicy', /\bspic(y|e)\b/],
  ['peppery', /\bpepper(y)?\b/],
  ['floral', /\bfloral\b/],
  ['mineral', /\bmineral(ity)?\b/],
  ['smoky', /\bsmok(y|e)\b/],
  ['tannic', /\btannic\b/],
  ['sweet', /\bsweet\b/],
  ['acidic', /\bacid(ic|ity)?\b/],
  ['thin', /\bthin\b/],
  ['dry', /\bdry\b/],
];

// Sentences about what you're after ("Want a hint of fruit…") rather than what the wine was like.
const WISH = /^\s*(i\s+)?(want|wish|prefer|looking for|would like|i'?d like|next time)\b/i;

function sentences(notes: string): string[] {
  return notes.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
}

/** What you said you're after, in your own words. */
export function noteWishes(notes: string): string[] {
  return sentences(notes).filter((x) => WISH.test(x));
}

export function noteWords(notes: string): string[] {
  let text = fold(sentences(notes).filter((x) => !WISH.test(x)).join(' '));
  const out: string[] = [];
  for (const [word, re] of NOTE_WORDS) {
    if (re.test(text)) {
      out.push(word);
      text = text.replace(new RegExp(re.source, 'g'), ' ');
    }
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}

function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

const PLURAL: Record<WineStyle, string> = {
  red: 'reds',
  white: 'whites',
  rose: 'rosés',
  sparkling: 'sparkling wines',
  orange: 'orange wines',
  dessert: 'dessert wines',
  fortified: 'fortified wines',
};

export function buildTaste(collection: Wine[]): TasteProfile {
  const rated = collection.filter((w) => w.rating !== null);
  const groups = groupWines(rated);

  const affinities: Affinity[] = [];
  for (const kind of ['producer', 'grape', 'region', 'area', 'country'] as const) {
    for (const { value, wines } of groups[kind].values()) {
      const score = scoreOf(wines);
      if (score === null) continue;
      affinities.push({ kind, value, score, rated: wines.length, counts: countRatings(wines), strength: (score * Math.min(wines.length, 3)) / 3 });
    }
  }
  const byStrength = (a: Affinity, b: Affinity) => Math.abs(b.strength) - Math.abs(a.strength) || b.rated - a.rated;
  // A like needs a loved wine or two rated ones; a dislike needs a "wouldn't buy again".
  const likes = affinities.filter((a) => a.score >= 0.5 && (a.counts.loved > 0 || a.rated >= 2)).sort(byStrength);
  // One bottle is enough to dislike a producer or appellation, not a whole grape or area.
  const dislikes = affinities
    .filter((a) => a.score <= -0.5 && a.counts.wouldnt >= (a.kind === 'producer' || a.kind === 'region' ? 1 : 2))
    .sort(byStrength);

  // Most-enjoyed style, if it's clearly yours.
  let style: WineStyle | null = null;
  const enjoyed = rated.filter((w) => w.rating !== 'wouldnt' && w.style);
  if (enjoyed.length) {
    const counts = new Map<WineStyle, number>();
    for (const w of enjoyed) counts.set(w.style!, (counts.get(w.style!) ?? 0) + 1);
    const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (n / enjoyed.length >= 0.6) style = top;
  }

  // Usual price of wines you enjoyed: middle half, rounded to $5.
  const prices = rated.filter((w) => w.rating !== 'wouldnt' && w.price !== null).map((w) => w.price!).sort((a, b) => a - b);
  const price =
    prices.length >= 3
      ? { low: Math.max(5, Math.floor(percentile(prices, 0.25) / 5) * 5), high: Math.ceil(percentile(prices, 0.75) / 5) * 5 }
      : null;

  const wordsFor = (pred: (w: Wine) => boolean) => {
    const counts = new Map<string, number>();
    for (const w of rated.filter(pred)) for (const word of noteWords(w.notes)) counts.set(word, (counts.get(word) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  };
  const notesLiked = wordsFor((w) => w.rating !== null && RATING_VALUE[w.rating] > 0);
  // A word noted on both sides (e.g. "dry") says nothing either way.
  const both = wordsFor((w) => w.rating === 'wouldnt');
  const notesDisliked = both.filter((w) => !notesLiked.includes(w));
  const wishes = [...new Set(rated.flatMap((w) => noteWishes(w.notes)))].slice(0, 3);

  const summary: string[] = [];
  const places = likes.filter((a) => a.kind === 'region' || a.kind === 'area');
  // Skip an area when one of its regions is already named ("Southern Rhône" after "Châteauneuf-du-Pape").
  const placeNames: string[] = [];
  for (const p of places) {
    if (placeNames.length >= 3) break;
    if (p.kind === 'area' && places.some((r) => r.kind === 'region' && placeNames.includes(r.value) && groups.region.get(fold(r.value))?.wines.some((w) => groups.area.get(fold(p.value))?.wines.includes(w)))) continue;
    placeNames.push(p.value);
  }
  const grapes = likes.filter((a) => a.kind === 'grape').slice(0, 3).map((a) => a.value);
  if (placeNames.length || grapes.length || style) {
    let s = `You lean toward ${style ? PLURAL[style] : 'wines'}`;
    if (placeNames.length) s += ` from ${listJoin(placeNames)}`;
    if (grapes.length) s += `${placeNames.length ? ', especially' : ' made from'} ${listJoin(grapes)}`;
    if (price) s += `, usually $${price.low}–${price.high}`;
    summary.push(`${s}.`);
  }
  const avoid = dislikes.filter((a) => a.kind !== 'producer').slice(0, 2).map((a) => a.value);
  if (avoid.length) summary.push(`You tend to pass on ${listJoin(avoid)}.`);
  if (notesLiked.length) summary.push(`Your notes on wines you enjoyed mention ${listJoin(notesLiked.slice(0, 4))}.`);
  if (notesDisliked.length) summary.push(`On the ones you wouldn’t buy again: ${listJoin(notesDisliked.slice(0, 4))}.`);
  for (const wish of wishes) summary.push(`In your words: “${wish.replace(/[“”"]/g, '')}”`);

  return { rated: rated.length, enough: rated.length >= MIN_RATED, likes, dislikes, style, price, notesLiked, notesDisliked, wishes, summary };
}
