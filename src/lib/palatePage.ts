import type { Wine, WineStyle } from '../types';
import { canonicalGrape, findAppellation } from './appellations';
import { GRAPES } from './catalogMatch';
import { RATING_VALUE } from './insights';
import type { Passport } from './passport';
import { norm } from './catalogNorm';
import { profileFavourites, type PalateProfile } from './profile';
import type { TasteProfile } from './taste';
import { fold } from './text';

/**
 * What My palate says, in short: each fact once. Reads the imported profile and your ratings;
 * changes nothing in them (the full profile still goes to Claude, see profileContext).
 */

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pref = (p: PalateProfile | null, key: string) => p?.preferences.find((x) => (x.key ?? x.dimension.replace(/ /g, '_')) === key)?.value.replace(/\s*\([^()]*\)$/, '') ?? '';
const listJoin = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/**
 * The paragraph under the headline: what your ratings show (where you lean, what you pass on)
 * and what your imported profile says, in your voice, as one read. The "wouldn't buy again"
 * notes are left to the Skips row.
 */
export function heroSummary(profile: PalateProfile | null, taste: TasteProfile | null, headlineFromTaste: boolean): string {
  const counted = taste?.enough ? taste.summary.filter((l) => !l.startsWith('In your words') && !l.startsWith('On the ones')) : [];
  const fromRatings = headlineFromTaste ? counted.slice(1) : counted;
  const lean = fromRatings.filter((l) => !l.startsWith('You tend to pass on'));
  const pass = fromRatings.filter((l) => l.startsWith('You tend to pass on'));
  // "Prefers …; also enjoys …." → "You prefer …, and also enjoy …."
  const said = (profile?.summary.match(/[^.]+\./g) ?? []).map((x) =>
    x
      .trim()
      .replace(/^prefers\b/i, 'You prefer')
      .replace(/;\s*also enjoys\b/i, ', and also enjoy')
      .replace(/^enjoys\b/i, 'You enjoy'),
  );
  return [...lean, ...said, ...pass].join(' ');
}

/** Rated wines of a colour needed before your ratings, not the imported profile, describe it. */
export const MIN_RATED_STYLE = 3;

export interface RatedStyle {
  /** Main grapes, best first (each wine counts for its first-listed grape, so a Bordeaux blend counts as Cabernet, not Merlot). */
  grapes: string[];
  /** Appellations, best first. */
  places: string[];
  /** Note words on the ones you enjoyed. */
  words: string[];
}

/**
 * What your ratings say about one colour: Loved +1, Liked +0.5, Wouldn't buy again −1, summed per
 * main grape and per appellation, keeping only what comes out clearly ahead. Null below
 * MIN_RATED_STYLE rated wines of that colour, or when nothing stands out.
 */
export function ratedStyle(wines: Wine[], style: WineStyle, wordsOf: (notes: string) => string[] = () => []): RatedStyle | null {
  const colourOf = (w: Wine) => w.style ?? findAppellation(`${w.region} ${w.name}`)?.style ?? null;
  const mine = wines.filter((w) => w.rating !== null && colourOf(w) === style);
  if (mine.length < MIN_RATED_STYLE) return null;
  const rank = (keyOf: (w: Wine) => string) => {
    const pts = new Map<string, { sum: number; loved: number }>();
    for (const w of mine) {
      const k = keyOf(w);
      if (!k) continue;
      const cur = pts.get(k) ?? { sum: 0, loved: 0 };
      cur.sum += RATING_VALUE[w.rating!];
      if (w.rating === 'loved') cur.loved++;
      pts.set(k, cur);
    }
    // Ahead means at least one loved bottle and a clearly positive total.
    return [...pts]
      .filter(([, v]) => v.loved > 0 && v.sum >= 1)
      .sort((a, b) => b[1].sum - a[1].sum || b[1].loved - a[1].loved)
      .map(([k]) => k);
  };
  const grapes = rank(mainGrape);
  const places = rank((w) => findAppellation(`${w.region} ${w.name}`)?.name ?? '');
  if (!grapes.length && !places.length) return null;
  const counts = new Map<string, number>();
  for (const w of mine.filter((x) => x.rating !== 'wouldnt')) for (const word of wordsOf(w.notes)) counts.set(word, (counts.get(word) ?? 0) + 1);
  const words = [...counts].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  return { grapes, places, words };
}

/** "Pinot Noir, Grenache, Cabernet Sauvignon and Nebbiolo, most of all from Barolo and Pauillac." */
function ratedLine(r: RatedStyle): string {
  const grapes = listJoin(r.grapes.slice(0, 4));
  const places = listJoin(r.places.slice(0, 3));
  const head = grapes ? `${grapes}${places ? `, most of all from ${places}` : ''}` : `Most of all from ${places}`;
  const words = r.words.slice(0, 3);
  return `${cap(head)}.${words.length ? ` Your notes say ${listJoin(words)}.` : ''}`;
}

/** Your favourite red from your ratings (its leading grape); '' until there's enough to say. */
export function ratedFavouriteRed(wines: Wine[]): string {
  return ratedStyle(wines, 'red')?.grapes[0] ?? '';
}

/** Reds: from your ratings once there are enough, otherwise from the imported profile. */
export function redsFromRatings(wines: Wine[], profile: PalateProfile | null, wordsOf?: (notes: string) => string[]): string {
  const r = ratedStyle(wines, 'red', wordsOf);
  return r ? ratedLine(r) : redsLine(profile);
}

/** Whites: from your ratings once there are enough, otherwise from the imported profile. */
export function whitesFromRatings(wines: Wine[], profile: PalateProfile | null, wordsOf?: (notes: string) => string[]): string {
  const r = ratedStyle(wines, 'white', wordsOf);
  return r ? ratedLine(r) : whitesLine(profile);
}

/** Each wine's main grape: its first-listed one, else its appellation's. */
function mainGrape(w: Wine): string {
  return w.grapes[0] ? canonicalGrape(w.grapes[0]) : (findAppellation(`${w.region} ${w.name}`)?.grapes[0] ?? '');
}

/** Main grapes you've rated "Wouldn't buy again" and never enjoyed (Merlot after a flat Côtes de Bourg). */
export function passedGrapes(wines: Wine[]): string[] {
  const enjoyed = new Set(wines.filter((w) => w.rating === 'loved' || w.rating === 'liked').map(mainGrape));
  return [...new Set(wines.filter((w) => w.rating === 'wouldnt').map(mainGrape))].filter((g) => g && !enjoyed.has(g));
}

/**
 * Worth exploring, from your ratings: the passport's next steps (next door to a place you loved,
 * a grape you love from somewhere new, a classic you haven't met). Suggested places are kept to
 * the step's colour and leave out grapes you've passed on; a step left with nothing to try is
 * dropped. Falls back to the imported profile's ideas when there are none.
 */
export function exploreFromRatings(passport: Passport | null, profile: PalateProfile | null, wines: Wine[] = [], n = 3): { title: string; sub: string }[] {
  const avoid = new Set(passedGrapes(wines).map(fold));
  const cards: { title: string; sub: string }[] = [];
  for (const step of passport?.next ?? []) {
    if (step.grape && avoid.has(fold(step.grape))) continue;
    const tryThese = step.tryThese.filter((name) => {
      const app = findAppellation(name);
      if (!app) return true;
      if (step.style && app.style && app.style !== step.style) return false;
      return !app.grapes[0] || !avoid.has(fold(app.grapes[0]));
    });
    if (!tryThese.length) continue;
    cards.push({ title: step.title, sub: `Try ${listJoin(tryThese)}` });
    if (cards.length >= n) break;
  }
  return cards.length ? cards : exploreCards(profile, n);
}

/** "Noticeable, gripping tannin with some clear fruit." */
export function redsLine(profile: PalateProfile | null): string {
  const tannin = pref(profile, 'tannin').split(/[,;]/)[0].replace(/\//g, ', ').trim().toLowerCase();
  const fruit = pref(profile, 'fruit').split(/;/)[0].trim().toLowerCase();
  if (!tannin && !fruit) return '';
  if (!tannin) return `${cap(fruit)}.`;
  const t = /tannin/.test(tannin) ? tannin : `${tannin} tannin`;
  return `${cap(t)}${fruit ? ` with ${fruit}` : ''}.`;
}

/** "Crisp, citrusy, clean whites over buttery ones." */
export function whitesLine(profile: PalateProfile | null): string {
  const v = pref(profile, 'white_style');
  if (!v) return '';
  const [first, ...rest] = v.split(';');
  const over = rest.join(';').match(/over (\w+) whites?/i);
  const base = first.trim().replace(/\.$/, '');
  return `${cap(/whites?\b/i.test(base) ? base : `${base} whites`)}${over ? ` over ${over[1].toLowerCase()} ones` : ''}.`;
}

/**
 * What you skip: sweetness when your profile says to avoid it, then what your "Wouldn't buy
 * again" notes have in common. "Sweet wines, and light reds with no tannin grip."
 */
export function skipsLine(taste: TasteProfile | null, wines: Wine[], profile: PalateProfile | null = null): string {
  const words = taste?.notesDisliked.slice(0, 4) ?? [];
  const said = profile?.preferences.map((x) => x.value).join(' ') ?? '';
  const sweet = /avoid[^.;]*sweet/i.test(said) && !words.includes('sweet');
  let fromNotes = '';
  if (words.length) {
    const lacks = words.filter((w) => /^(no|little|not)\b/.test(w));
    const traits = words.filter((w) => !lacks.includes(w));
    const styles = new Set(wines.filter((w) => w.rating === 'wouldnt' && w.style).map((w) => w.style));
    const noun = styles.size === 1 ? ({ red: 'reds', white: 'whites', rose: 'rosés', sparkling: 'sparkling wines' } as Record<string, string>)[[...styles][0]!] ?? 'wines' : 'wines';
    fromNotes = `${traits.length ? `${traits.join(', ')} ${noun}` : noun}${lacks.length ? ` with ${listJoin(lacks)}` : ''}`;
  }
  const parts = [sweet ? 'sweet wines' : '', fromNotes].filter(Boolean);
  return parts.length ? `${cap(parts.join(', and '))}.` : '';
}

/** A value between two sorted prices (linear, like a spreadsheet's PERCENTILE). */
function percentile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/**
 * Your usual price: the middle half (25th–75th percentile) of what you paid, rounded to $5, so one
 * expensive bottle doesn't move it. Shop prices only (a price noted as a restaurant's is left out).
 * Loved wines when at least 3 have a price; otherwise every bottle you paid for except the ones
 * you wouldn't buy again.
 */
export function usualPrice(wines: Wine[]): { low: number; high: number } | null {
  const shop = wines.filter((w) => w.price !== null && w.price > 0 && !/restaurant/i.test(w.notes) && w.rating !== 'wouldnt');
  const loved = shop.filter((w) => w.rating === 'loved');
  const pool = (loved.length >= 3 ? loved : shop).map((w) => w.price!).sort((a, b) => a - b);
  if (pool.length < 2) return null;
  return { low: round5(percentile(pool, 0.25)), high: round5(percentile(pool, 0.75)) };
}

export function budgetLine(wines: Wine[], profile: PalateProfile | null): string {
  const u = usualPrice(wines);
  const usual = u ? (u.low === u.high ? `Usually about $${u.low}.` : `Usually $${u.low}–$${u.high}.`) : '';
  const top = profile?.budget ? `Up to $${profile.budget} for something special.` : '';
  return [usual, top].filter(Boolean).join(' ');
}

/** The profile's "worth exploring" ideas as card text; the notes meant for Claude stay out of sight. */
export function exploreCards(profile: PalateProfile | null, n = 3): { title: string; sub: string }[] {
  if (!profile) return [];
  const friendly = (limits: string) =>
    /one bottle|single bottle/i.test(limits)
      ? 'Based on one bottle so far'
      : /unrated|not rated/i.test(limits)
        ? 'From a bottle you tasted but haven’t rated'
        : /sample|prior recommendation/i.test(limits)
          ? 'From the bottles you’ve tried so far'
          : '';
  // Ideas that point somewhere to go first ("deserves attention", "a strong starting point").
  const direction = (h: string) => /deserve|worth|direction|starting point|explore|try/i.test(h);
  return [...profile.inferences]
    .sort((a, b) => Number(direction(b.hypothesis)) - Number(direction(a.hypothesis)))
    .slice(0, n)
    .map((x) => {
      const [head, ...rest] = x.hypothesis.split(';');
      const after = rest.join(';').trim().replace(/\.$/, '');
      return { title: head.trim().replace(/\.$/, ''), sub: after ? cap(after) : friendly(x.limits) };
    });
}

/** Your favourites and the places and grapes you rate well, once each: places first, then grapes. `shown`: the header's text; names in it aren't repeated. */
export function loveChips(profile: PalateProfile | null, taste: TasteProfile | null, fallback: string[] = [], shown = ''): string[] {
  const named = profileFavourites(profile);
  const counted = taste?.enough ? taste.likes.filter((a) => a.kind === 'region' || a.kind === 'area' || a.kind === 'grape').map((a) => a.value) : fallback;
  const seen = new Set<string>();
  const all = [...named, ...counted].filter((v) => {
    const k = fold(v);
    return v && !mentions(shown, v) && !seen.has(k) && seen.add(k);
  });
  const isGrape = (v: string) => norm(v).split(' ').every((t) => GRAPES.has(t) || t === 'noir' || t === 'blanc' || t === 'gris');
  return [...all.filter((v) => !isGrape(v)).slice(0, 7), ...all.filter(isGrape).slice(0, 6)];
}

/** Whether a name appears in a text, as whole words ("Rioja" in "…from Rioja, Burgundy…"). */
export function mentions(text: string, name: string): boolean {
  const t = ` ${fold(text).replace(/[^a-z0-9]+/g, ' ')} `;
  const n = fold(name).replace(/[^a-z0-9]+/g, ' ').trim();
  return Boolean(n) && t.includes(` ${n} `);
}
