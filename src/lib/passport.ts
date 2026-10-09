import type { Wine, WineStyle } from '../types';
import { APPELLATIONS, canonicalGrape, findAppellation } from './appellations';

/**
 * Your wine passport: the places and grapes you've tasted, which you loved, and where to go
 * next. Worked out on the device from your bottles and the appellation guide: free.
 * "Tasted" means rated (any rating); Want to try and Not for me bottles don't count.
 */

export interface Stamp {
  name: string;
  tried: number;
  loved: number;
  wines: Wine[];
}

export interface Place extends Stamp {
  country: string;
  /** Appellations tasted here (or the region as written, when it isn't in the guide). */
  stamps: Stamp[];
  /** Appellations in the guide from this area you haven't tasted. */
  notYet: string[];
}

export interface NextStep {
  kind: 'neighbour' | 'grape' | 'classic';
  title: string;
  why: string;
  tryThese: string[];
  /** Bottles you already have (or want to try) that fit: start with these. */
  waiting: Wine[];
  /** What fits: from this area (when set), of this grape (when set), in this colour (when known). */
  area?: string;
  grape?: string;
  style?: WineStyle;
}

export interface Passport {
  tasted: number;
  places: Place[];
  grapes: Stamp[];
  countries: string[];
  next: NextStep[];
  /** Classic grapes you haven't tasted yet. */
  classicsNotYet: string[];
}

const WHITE_GRAPES = new Set(['Chardonnay', 'Riesling', 'Sauvignon Blanc', 'Chenin Blanc']);

/** Grapes worth knowing, each with where it's at its most classic. */
export const CLASSIC_GRAPES = [
  'Pinot Noir',
  'Cabernet Sauvignon',
  'Syrah',
  'Grenache',
  'Nebbiolo',
  'Sangiovese',
  'Tempranillo',
  'Gamay',
  'Merlot',
  'Chardonnay',
  'Riesling',
  'Sauvignon Blanc',
  'Chenin Blanc',
] as const;

const tasted = (w: Wine) => w.rating !== null && w.list !== 'want' && w.list !== 'passed';
/** Not tasted yet, but on hand or on your Want to try list. */
const waitingBottle = (w: Wine) => w.rating === null && w.list !== 'passed' && (w.owned > 0 || w.list === 'want');
const appOf = (w: Wine) => findAppellation(`${w.region} ${w.name}`);
const grapesOf = (w: Wine): string[] => {
  const named = [...new Set(w.grapes.map(canonicalGrape).filter(Boolean))];
  return named.length ? named : (appOf(w)?.grapes ?? []);
};
const bump = (s: Stamp, w: Wine) => {
  s.tried++;
  if (w.rating === 'loved') s.loved++;
  s.wines.push(w);
};
const byLove = <T extends Stamp>(a: T, b: T) => b.loved - a.loved || b.tried - a.tried || a.name.localeCompare(b.name);

/**
 * The guide's appellations that are mostly this grape, grouped by area, e.g. Syrah → Northern
 * Rhône: Crozes-Hermitage… With a style, places known for another style (a rosé region for a
 * red you loved) are left out.
 */
export function homesOf(grape: string, style: WineStyle | null = null): { area: string; country: string; names: string[] }[] {
  const out: { area: string; country: string; names: string[] }[] = [];
  for (const a of APPELLATIONS) {
    if (a.grapes[0] !== grape || (style && a.style && a.style !== style)) continue;
    const home = out.find((h) => h.area === a.area);
    if (home) home.names.push(a.name);
    else out.push({ area: a.area, country: a.country, names: [a.name] });
  }
  return out;
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function buildPassport(wines: Wine[]): Passport {
  const mine = wines.filter(tasted);
  const places = new Map<string, Place>();
  const grapes = new Map<string, Stamp>();

  for (const w of mine) {
    const app = appOf(w);
    const area = app?.area ?? w.region.trim();
    if (area) {
      const country = app?.country ?? w.country.trim();
      let place = places.get(area);
      if (!place) places.set(area, (place = { name: area, country, tried: 0, loved: 0, wines: [], stamps: [], notYet: [] }));
      bump(place, w);
      const stampName = app?.name ?? w.region.trim();
      let stamp = place.stamps.find((s) => s.name === stampName);
      if (!stamp) place.stamps.push((stamp = { name: stampName, tried: 0, loved: 0, wines: [] }));
      bump(stamp, w);
    }
    for (const g of grapesOf(w)) {
      let stamp = grapes.get(g);
      if (!stamp) grapes.set(g, (stamp = { name: g, tried: 0, loved: 0, wines: [] }));
      bump(stamp, w);
    }
  }

  for (const place of places.values()) {
    place.stamps.sort(byLove);
    const been = new Set(place.stamps.map((s) => s.name));
    // The area's own catch-all name ("Bordeaux", "Bourgogne") isn't a new place to try.
    place.notYet = APPELLATIONS.filter((a) => a.area === place.name && !been.has(a.name) && a.name !== a.area && a.grapes.length > 0).map((a) => a.name);
  }

  const placeList = [...places.values()].sort(byLove);
  const grapeList = [...grapes.values()].sort(byLove);
  const triedGrapes = new Set(grapeList.map((g) => g.name));
  const triedAreas = new Set(placeList.map((p) => p.name));
  const next: NextStep[] = [];

  // 1. Next door to a place you loved.
  for (const place of placeList.filter((p) => p.loved > 0)) {
    const lovedGrapes = new Set(place.wines.filter((w) => w.rating === 'loved').flatMap(grapesOf));
    const fits = (n: string) => APPELLATIONS.find((a) => a.name === n)?.grapes.some((g) => lovedGrapes.has(g)) ?? false;
    const picks = [...place.notYet.filter(fits), ...place.notYet.filter((n) => !fits(n))].slice(0, 3);
    if (!picks.length) continue;
    next.push({
      kind: 'neighbour',
      title: `More of ${place.name}`,
      why: `You loved ${list(place.stamps.filter((s) => s.loved).map((s) => s.name).slice(0, 2))}. Its neighbours are made from similar grapes on similar ground, with their own accent.`,
      tryThese: picks,
      waiting: [],
      area: place.name,
      style: place.wines.filter((w) => w.rating === 'loved').map((w) => w.style).find(Boolean) ?? undefined,
    });
    if (next.length >= 2) break;
  }

  // 2. A grape you love, from somewhere you've never been.
  for (const g of grapeList.filter((x) => x.loved > 0)) {
    // The colour you loved it in: Grenache as a red shouldn't send you to a rosé region.
    const styles = g.wines.filter((w) => w.rating === 'loved').map((w) => w.style ?? appOf(w)?.style ?? null);
    const style = styles.find(Boolean) ?? null;
    const home = homesOf(g.name, style).find((h) => !triedAreas.has(h.area));
    if (!home) continue;
    next.push({
      kind: 'grape',
      title: `${g.name} from ${home.area}`,
      why: `You love ${g.name}, but you haven’t had it from ${home.area} (${home.country}). Same grape, different place: a good way to taste what the place does.`,
      tryThese: home.names.slice(0, 3),
      waiting: [],
      area: home.area,
      grape: g.name,
      style: style ?? undefined,
    });
    if (next.filter((n) => n.kind === 'grape').length >= 2) break;
  }

  // 3. A classic grape you haven't met yet: first the ones you already have a bottle of.
  const waiting = wines.filter(waitingBottle);
  const classicsNotYet = CLASSIC_GRAPES.filter((g) => !triedGrapes.has(g));
  const have = (g: string) => waiting.some((w) => grapesOf(w).includes(g));
  for (const g of [...classicsNotYet.filter(have), ...classicsNotYet.filter((x) => !have(x))].slice(0, 2)) {
    const home = homesOf(g)[0];
    if (!home) continue;
    next.push({
      kind: 'classic',
      title: `Meet ${g}`,
      why: `One of the classic grapes you haven’t tasted yet. ${home.area} is where it’s at its most typical.`,
      tryThese: home.names.slice(0, 3),
      waiting: [],
      grape: g,
      area: home.area,
      style: WHITE_GRAPES.has(g) ? 'white' : 'red',
    });
  }

  // Bottles you already have that fit a suggestion: the easiest way to take it.
  const tastedHere = new Set(mine.map((m) => appOf(m)?.name).filter(Boolean));
  for (const step of next) {
    step.waiting = waiting.filter((w) => {
      const app = appOf(w);
      if (app && step.tryThese.includes(app.name)) return true;
      // Meeting a grape: any bottle of it counts, wherever it's from.
      if (step.area && step.kind !== 'classic' && app?.area !== step.area) return false;
      // Next door means somewhere new: not another bottle from a place you've already tasted.
      if (step.kind === 'neighbour' && tastedHere.has(app!.name)) return false;
      return !step.grape || grapesOf(w).includes(step.grape);
    });
  }

  return {
    tasted: mine.length,
    places: placeList,
    grapes: grapeList,
    countries: [...new Set(placeList.map((p) => p.country).filter(Boolean))],
    next,
    classicsNotYet: [...classicsNotYet],
  };
}
