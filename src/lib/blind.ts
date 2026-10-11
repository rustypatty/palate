import { db, updateWine, type PalateDB } from '../db';
import type { BlindGuess, BlindPrice, BlindTasting, Rating, Wine, WineStyle } from '../types';
import { APPELLATIONS, canonicalGrape, findAppellation, type Appellation } from './appellations';
import { STYLE_LABEL } from './constants';
import { fold } from './text';

/**
 * Blind tasting: a bottle from your cellar is hidden, you guess what it is (colour, grape, place,
 * vintage, price) and rate it without seeing the label, then reveal. Checking the guesses and the
 * notes under the score are free, from the wine and Palate's appellation guide; Explain asks Claude
 * for a lesson (blindClient.ts). Results are saved on the wine, so they sync.
 */

export const PRICE_LABEL: Record<BlindPrice, string> = { under20: 'Under $20', '20to40': '$20–40', over40: '$40+' };

export const NOTICED = ['Dark fruit', 'Red fruit', 'Citrus', 'Stone fruit', 'Herbal', 'Floral', 'Earthy', 'Spicy', 'Oaky', 'High acid', 'Grippy tannins', 'Full-bodied', 'Light', 'Sweet'] as const;

const RED_GRAPES = ['Pinot Noir', 'Cabernet Sauvignon', 'Merlot', 'Syrah', 'Grenache', 'Malbec', 'Zinfandel', 'Tempranillo', 'Sangiovese', 'Nebbiolo', 'Cabernet Franc', 'Gamay', 'Barbera'];
const WHITE_GRAPES = ['Chardonnay', 'Sauvignon Blanc', 'Riesling', 'Chenin Blanc', 'Pinot Gris', 'Viognier', 'Albariño', 'Grüner Veltliner', 'Gewürztraminer'];

export const emptyGuess = (): BlindGuess => ({ style: null, grape: null, country: null, region: null, vintage: null, price: null, noticed: [] });

const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = fold(x);
    if (!x.trim() || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** Grapes to choose from: the usual ones for this colour, then others from your own wines of that colour. */
export function grapeChoices(style: WineStyle | null, wines: Wine[]): string[] {
  const base = style === 'red' ? RED_GRAPES : style === 'white' ? WHITE_GRAPES : [...RED_GRAPES.slice(0, 6), ...WHITE_GRAPES.slice(0, 4)];
  const yours = wines.filter((w) => !style || w.style === style).flatMap((w) => w.grapes.map(canonicalGrape));
  return uniq([...base, ...yours]);
}

/** Countries: the guide's, then others from your wines. */
export function countryChoices(wines: Wine[]): string[] {
  const guide = ['France', 'Italy', 'Spain', 'USA', 'Germany', 'Portugal', 'Argentina', 'Australia', 'New Zealand', 'Austria'];
  return uniq([...guide, ...wines.map((w) => w.country)]);
}

/** Regions in a country: the guide's areas (Bordeaux, Loire…), then regions from your wines there. */
export function regionChoices(country: string | null, wines: Wine[]): string[] {
  if (!country) return [];
  const areas = APPELLATIONS.filter((a) => fold(a.country) === fold(country) && !a.area.includes('(')).map((a) => a.area);
  const yours = wines.filter((w) => fold(w.country) === fold(country)).map((w) => findAppellation(`${w.region} ${w.name}`)?.area ?? w.region);
  return uniq([...areas, ...yours]);
}

export function priceBand(price: number): BlindPrice {
  return price < 20 ? 'under20' : price < 40 ? '20to40' : 'over40';
}

const appOf = (w: Wine): Appellation | null => findAppellation(`${w.region} ${w.name}`);

/** The wine's grapes: as saved, else what its appellation is usually made from. */
export function grapesOf(w: Wine): string[] {
  const named = uniq(w.grapes.map(canonicalGrape));
  return named.length ? named : (appOf(w)?.grapes ?? []);
}

export interface Check {
  key: 'style' | 'grape' | 'country' | 'region' | 'vintage' | 'price';
  label: string;
  said: string;
  was: string;
  right: boolean;
}

const NOT_SURE = 'Not sure';

/** Each guess against the answer. Things the wine doesn't say (no price, NV…) are left out. */
export function checkGuess(w: Wine, g: BlindGuess): Check[] {
  const out: Check[] = [];
  if (w.style) out.push({ key: 'style', label: 'Colour', said: g.style ? STYLE_LABEL[g.style] : NOT_SURE, was: STYLE_LABEL[w.style], right: g.style === w.style });

  const grapes = grapesOf(w);
  if (grapes.length) {
    const right = Boolean(g.grape) && grapes.some((x) => fold(x) === fold(canonicalGrape(g.grape!)));
    out.push({ key: 'grape', label: 'Grape', said: g.grape ?? NOT_SURE, was: grapes.slice(0, 3).join(', '), right });
  }

  if (w.country.trim()) out.push({ key: 'country', label: 'Country', said: g.country ?? NOT_SURE, was: w.country, right: Boolean(g.country) && fold(g.country!) === fold(w.country) });

  const app = appOf(w);
  const region = w.region.trim() || app?.name || '';
  if (region) {
    const was = app && fold(app.area) !== fold(region) ? `${region} (${app.area})` : region;
    out.push({ key: 'region', label: 'Region', said: g.region ?? NOT_SURE, was, right: Boolean(g.region) && sameRegion(g.region!, w, app) });
  }

  if (typeof w.vintage === 'number') {
    out.push({
      key: 'vintage',
      label: 'Vintage',
      said: g.vintage ? String(g.vintage) : NOT_SURE,
      was: String(w.vintage),
      // Within a year counts: telling 2019 from 2020 blind is luck.
      right: g.vintage !== null && Math.abs(g.vintage - w.vintage) <= 1,
    });
  }

  if (w.price !== null && w.price > 0) {
    out.push({ key: 'price', label: 'Price', said: g.price ? PRICE_LABEL[g.price] : NOT_SURE, was: `$${Math.round(w.price)}`, right: g.price === priceBand(w.price) });
  }
  return out;
}

function sameRegion(guess: string, w: Wine, app: Appellation | null): boolean {
  const gk = fold(guess);
  if (app && (gk === fold(app.area) || gk === fold(app.name))) return true;
  const r = fold(w.region);
  return Boolean(r) && (r === gk || r.includes(gk) || gk.includes(r));
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** One or two lines from the guide under the score, e.g. "Chinon is usually made from Cabernet Franc." Free. */
export function revealNotes(w: Wine, g: BlindGuess, checks: Check[]): string[] {
  const notes: string[] = [];
  const missed = (k: Check['key']) => checks.some((c) => c.key === k && !c.right);
  const app = appOf(w);
  if (app?.grapes.length && (missed('grape') || missed('region'))) notes.push(`${app.name} is usually made from ${list(app.grapes)}.`);
  const actual = grapesOf(w)[0];
  if (actual && g.region && missed('grape')) {
    // The place you guessed grows this grape too: a near miss.
    const there = APPELLATIONS.some((a) => fold(a.area) === fold(g.region!) && a.grapes.some((x) => fold(x) === fold(actual)));
    if (there) notes.push(`${g.region} grows ${actual} too, so you were close.`);
  }
  return notes;
}

/**
 * Saves a blind tasting on the wine. The rating you gave blind becomes the wine's rating if it
 * had none; otherwise it's kept with the tasting only.
 */
export async function saveBlind(wine: Wine, guess: BlindGuess, rating: Rating | null, database: PalateDB = db, now = Date.now()): Promise<BlindTasting> {
  const checks = checkGuess(wine, guess);
  const tasting: BlindTasting = { at: now, guess, rating, right: checks.filter((c) => c.right).length, of: checks.length };
  const current = (await database.wines.get(wine.id)) ?? wine;
  await updateWine(
    wine.id,
    {
      blind: [...(current.blind ?? []), tasting],
      ...(rating && !current.rating ? { rating, tastedOn: current.tastedOn ?? new Date(now).toISOString().slice(0, 10) } : {}),
    },
    database,
  );
  return tasting;
}

/** Keeps Claude's lesson with the tasting, so reopening it is free. */
export async function saveExplain(wineId: string, at: number, explain: { text: string; tip: string }, database: PalateDB = db): Promise<void> {
  const w = await database.wines.get(wineId);
  if (!w?.blind) return;
  await updateWine(wineId, { blind: w.blind.map((t) => (t.at === at ? { ...t, explain } : t)) }, database);
}

export interface BlindRecord {
  tastings: number;
  right: number;
  of: number;
  /** Per grape (the wine's main one): how often you named it. */
  grapes: { grape: string; tried: number; named: number }[];
  /** Grapes you took for another more than once: "Malbec for Syrah". */
  mixups: { said: string; was: string; times: number }[];
}

/** Your blind tastings across all wines, for Passport. */
export function blindRecord(wines: Wine[]): BlindRecord {
  const rec: BlindRecord = { tastings: 0, right: 0, of: 0, grapes: [], mixups: [] };
  const mix = new Map<string, { said: string; was: string; times: number }>();
  for (const w of wines) {
    for (const t of w.blind ?? []) {
      rec.tastings++;
      rec.right += t.right;
      rec.of += t.of;
      const grape = grapesOf(w)[0];
      if (!grape) continue;
      let g = rec.grapes.find((x) => x.grape === grape);
      if (!g) rec.grapes.push((g = { grape, tried: 0, named: 0 }));
      g.tried++;
      const said = t.guess.grape ? canonicalGrape(t.guess.grape) : null;
      if (said && grapesOf(w).some((x) => fold(x) === fold(said))) g.named++;
      else if (said) {
        const k = `${said}>${grape}`;
        const m = mix.get(k) ?? { said, was: grape, times: 0 };
        m.times++;
        mix.set(k, m);
      }
    }
  }
  rec.grapes.sort((a, b) => b.tried - a.tried || a.grape.localeCompare(b.grape));
  rec.mixups = [...mix.values()].filter((m) => m.times > 1).sort((a, b) => b.times - a.times);
  return rec;
}

/** Bottles you can taste blind: the ones you own. */
export const blindCandidates = (wines: Wine[]) => wines.filter((w) => !w.list && w.owned > 0 && (w.producer || w.name));

/** Claude's lesson for a tasting (Explain): saved with it. About 2–3¢. */
export async function explainBlind(wine: Wine, tasting: BlindTasting, wines: Wine[]): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  const [{ shelfContext }, { buildTaste }, { explainBlindWithClaude }] = await Promise.all([import('./shelf'), import('./taste'), import('./blindClient')]);
  const others = wines.filter((w) => !w.list && w.id !== wine.id);
  const checks = checkGuess(wine, tasting.guess).map((c) => `${c.label}: said ${c.said}, was ${c.was} (${c.right ? 'right' : 'wrong'})`);
  const facts = [
    [wine.producer, wine.name, wine.vintage ?? ''].filter(Boolean).join(' '),
    grapesOf(wine).join('/'),
    [wine.region, wine.country].filter(Boolean).join(', '),
    wine.price ? `$${Math.round(wine.price)}` : '',
  ].filter(Boolean);
  const out = await explainBlindWithClaude(apiKey, { wine: facts.join(' · '), checks, noticed: tasting.guess.noticed, context: shelfContext(others, buildTaste(others)) }).catch(
    (e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : 'unexpected error' }),
  );
  if (!out.ok) return out;
  await saveExplain(wine.id, tasting.at, out.explain);
  return { ok: true };
}
