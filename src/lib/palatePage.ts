import type { Wine } from '../types';
import { GRAPES } from './catalogMatch';
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

/** One or two short sentences under the headline: the imported summary, trimmed. */
export function heroSummary(profile: PalateProfile | null, taste: TasteProfile | null, headlineFromTaste: boolean): string {
  if (profile?.summary) {
    const sentences = profile.summary.match(/[^.]+\./g) ?? [profile.summary];
    // "Prefers structured reds …; also enjoys …" → "Structured reds …."
    const short = sentences.map((s) => cap(s.trim().replace(/^prefers\s+/i, '').replace(/[;,]\s*(also|with)\b.*$/i, '').replace(/\.?$/, '.')));
    const two = short.slice(0, 2).join(' ');
    return two.length <= 120 ? two : short[0];
  }
  // No profile: the next thing your ratings say (the first is the headline when there's no favourite).
  const counted = taste?.enough ? taste.summary.filter((l) => !l.startsWith('In your words')) : [];
  return counted[headlineFromTaste ? 1 : 0] ?? '';
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

/** What your "Wouldn't buy again" notes have in common: "Fruit-forward, light reds with no tannin grip." */
export function skipsLine(taste: TasteProfile | null, wines: Wine[]): string {
  const words = taste?.notesDisliked.slice(0, 4) ?? [];
  if (!words.length) return '';
  const lacks = words.filter((w) => /^(no|little|not)\b/.test(w));
  const traits = words.filter((w) => !lacks.includes(w));
  const styles = new Set(wines.filter((w) => w.rating === 'wouldnt' && w.style).map((w) => w.style));
  const noun = styles.size === 1 ? ({ red: 'reds', white: 'whites', rose: 'rosés', sparkling: 'sparkling wines' } as Record<string, string>)[[...styles][0]!] ?? 'wines' : 'wines';
  const head = traits.length ? `${traits.join(', ')} ${noun}` : noun;
  return `${cap(head)}${lacks.length ? ` with ${listJoin(lacks)}` : ''}.`;
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

/** Your favourites and the places and grapes you rate well, once each: places first, then grapes. `headline`: already shown above. */
export function loveChips(profile: PalateProfile | null, taste: TasteProfile | null, fallback: string[] = [], headline = ''): string[] {
  const named = profileFavourites(profile);
  const counted = taste?.enough ? taste.likes.filter((a) => a.kind === 'region' || a.kind === 'area' || a.kind === 'grape').map((a) => a.value) : fallback;
  // The headline's favourite isn't repeated here.
  const seen = new Set<string>(headline ? [fold(headline)] : []);
  const all = [...named, ...counted].filter((v) => {
    const k = fold(v);
    return v && !seen.has(k) && seen.add(k);
  });
  const isGrape = (v: string) => norm(v).split(' ').every((t) => GRAPES.has(t) || t === 'noir' || t === 'blanc' || t === 'gris');
  return [...all.filter((v) => !isGrape(v)).slice(0, 7), ...all.filter(isGrape).slice(0, 6)];
}

