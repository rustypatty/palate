import type { Wine, WineStyle } from '../types';
import { canonicalGrape, factsFromText, findAppellation } from './appellations';
import type { CatalogFacts } from './catalogFacts';
import { CRISP_PLACES, glassFor, type Glass } from './glass';
import { grapeTraits, guideName } from './grapeGuide';
import type { PalateProfile } from './profile';
import { regionLines, regionPhoto, type RegionPhoto } from './regionGuide';
import type { TasteProfile } from './taste';

/**
 * The Structure, Grapes and Region sections at the end of a wine page. From the wine itself,
 * Palate's wine catalog (grapes, sub-region), Palate's own grape and region guides and your
 * ratings: nothing is asked of Claude, so they cost nothing.
 * Each returns null when there's nothing reliable to show, and the section is left out.
 */

export interface StructureRow {
  label: 'Body' | 'Tannin' | 'Acidity' | 'Sweetness';
  value: string;
  /** Filled segments, 1–5. */
  level: number;
}

export interface Structure {
  /** "Red · typical for Nebbiolo" */
  line: string;
  rows: StructureRow[];
  glass: Glass;
  /** One sentence tying it to your taste, or '' when there's nothing confident to say. */
  fit: string;
  matches: boolean;
}

const STYLE_WORD: Record<WineStyle, string> = { red: 'Red', white: 'White', rose: 'Rosé', sparkling: 'Sparkling', orange: 'Orange', dessert: 'Dessert', fortified: 'Fortified' };
const placeText = (w: Wine) => `${w.region} ${w.name}`;

const uniq = (gs: string[]) => [...new Set(gs.map(canonicalGrape).filter(Boolean))];

/** The wine's grapes; else the catalog's for it; else the place's usual grapes ("usual"). */
function grapesOf(wine: Wine, facts: CatalogFacts | null): { grapes: string[]; usual: boolean; catalog?: boolean } {
  const own = uniq(wine.grapes);
  if (own.length) return { grapes: own, usual: false };
  const catalog = uniq(facts?.grapes ?? []);
  if (catalog.length) return { grapes: catalog, usual: false, catalog: true };
  const usual = factsFromText(placeText(wine)).grapes;
  return { grapes: usual, usual: usual.length > 0 };
}

const level3 = (n: number, words: [string, string, string]) => (n <= 2 ? words[0] : n === 3 ? words[1] : words[2]);
const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

function prefText(p: PalateProfile | null, key: string): string {
  return p?.preferences.find((x) => (x.key ?? x.dimension.replace(/ /g, '_')) === key)?.value.toLowerCase() ?? '';
}

export function structureOf(wine: Wine, profile: PalateProfile | null, facts: CatalogFacts | null = null): Structure | null {
  const { grapes } = grapesOf(wine, facts);
  const known = grapes.map((g) => ({ g, t: grapeTraits(g) })).filter((x): x is { g: string; t: NonNullable<typeof x.t> } => Boolean(x.t));
  if (!known.length) return null;
  const style: WineStyle = wine.style ?? (known[0].t.red ? 'red' : 'white');
  // Chablis and other unoaked Chardonnay: lean and crisp, not the oaked kind the guide describes.
  const crisp = CRISP_PLACES.test(placeText(wine));
  const traits = known.map((x) => (crisp && guideName(x.g) === 'Chardonnay' ? { ...x.t, body: 2, acidity: 5 } : x.t));
  const body = avg(traits.map((t) => t.body));
  const tannin = avg(traits.map((t) => t.tannin));
  const acidity = avg(traits.map((t) => t.acidity));
  const area = findAppellation(placeText(wine))?.area ?? '';
  const sweetGrape = known.some((x) => ['Riesling', 'Chenin Blanc', 'Gewürztraminer'].includes(guideName(x.g) ?? ''));
  const sweetness =
    style === 'dessert' || (style === 'fortified' && !known.some((x) => guideName(x.g) === 'Palomino')) ? 5 : sweetGrape && (area === 'Mosel' || /sp[aä]tlese|auslese|kabinett|demi-sec|moelleux/i.test(wine.name)) ? 2 : 1;

  const hasTannin = style === 'red' || style === 'dessert' || style === 'fortified';
  const rows: StructureRow[] = [
    { label: 'Body', value: level3(body, ['Light', 'Medium', 'Full']), level: body },
    ...(hasTannin ? [{ label: 'Tannin' as const, value: level3(tannin, ['Low', 'Medium', 'High']), level: tannin }] : []),
    { label: 'Acidity', value: level3(acidity, ['Low', 'Medium', 'High']), level: acidity },
    { label: 'Sweetness', value: sweetness === 1 ? 'Dry' : sweetness < 4 ? 'Off-dry' : 'Sweet', level: sweetness },
  ];
  const lead = guideName(known[0].g)!;
  const abv = wine.abv ? `${wine.abv}% ABV` : '';
  const line = [STYLE_WORD[style], abv, grapes.length > 1 ? `typical for a ${lead} blend` : `typical for ${lead}`].filter(Boolean).join(' · ');
  const { fit, matches } = fitFor(style, { body, tannin, acidity, sweetness }, profile);
  return { line, rows, glass: glassFor(style, known.map((x) => x.g), placeText(wine)), fit, matches };
}

/** What your profile says about this structure, only when it says something clearly. */
export function fitFor(style: WineStyle, s: { body: number; tannin: number; acidity: number; sweetness: number }, profile: PalateProfile | null): { fit: string; matches: boolean } {
  if (!profile) return { fit: '', matches: false };
  const tanninPref = prefText(profile, 'tannin');
  const whitePref = prefText(profile, 'white_style');
  const avoidsSweet = /avoid[^.;]*sweet/i.test(profile.preferences.map((x) => x.value).join(' '));
  const likesGrip = /firm|grip|high|structured/.test(tanninPref);
  if (s.sweetness >= 4 && avoidsSweet) return { fit: 'Sweeter than the wines you usually like.', matches: false };
  if (style === 'red' && likesGrip) {
    if (s.tannin >= 4 && s.acidity >= 4) return { fit: 'Firm, gripping tannin with bright acidity: right in your style.', matches: true };
    if (s.tannin >= 4) return { fit: 'Firm, gripping tannin: right in your style.', matches: true };
    if (s.tannin <= 2) return { fit: 'Softer tannin than the reds you usually go for.', matches: false };
  }
  if (style === 'white' && /crisp|saline|mineral|zesty/.test(whitePref)) {
    if (s.acidity >= 4 && s.body <= 3) return { fit: 'Crisp and bright: the kind of white you prefer.', matches: true };
    if (s.body >= 4 && s.acidity <= 3) return { fit: 'Fuller and rounder than the crisp whites you usually prefer.', matches: false };
  }
  return { fit: '', matches: false };
}

export interface GrapeCard {
  /** The grapes, most important first (up to three). */
  names: string[];
  /** How many more grapes there are beyond those. */
  more: number;
  /** "100%" when it's the only grape, "Usually" when they're the place's usual grapes; else ''. */
  share: string;
  /** How the lead grape tastes. */
  taste: string;
  /** The grape of these you've loved most often, and how many. */
  loved: { grape: string; n: number } | null;
}

const lovedWith = (all: Wine[], grape: string) => all.filter((w) => w.rating === 'loved' && w.list !== 'passed' && w.grapes.some((g) => canonicalGrape(g) === grape)).length;

/** One card for all the wine's grapes, so a blend doesn't stretch the page. */
export function grapeCard(wine: Wine, all: Wine[], facts: CatalogFacts | null = null): GrapeCard | null {
  const { grapes, usual, catalog } = grapesOf(wine, facts);
  if (!grapes.length) return null;
  const names = grapes.slice(0, 3).map((g) => guideName(g) ?? g);
  const lead = grapes.map(grapeTraits).find(Boolean);
  const best = grapes
    .map((g) => ({ grape: guideName(g) ?? g, n: lovedWith(all, canonicalGrape(g)) }))
    .sort((a, b) => b.n - a.n)[0];
  return {
    names,
    more: Math.max(0, grapes.length - 3),
    share: usual ? 'Usually' : grapes.length === 1 ? '100%' : '',
    // The label's order is by share, so the first grape "leads"; the catalog's is only how often shops list it.
    taste:
      lead && grapes.length > 1 && guideName(grapes[0])
        ? `${guideName(grapes[0])}${catalog ? ':' : ' leads:'} ${lead.taste[0].toLowerCase()}${lead.taste.slice(1)}`
        : (lead?.taste ?? ''),
    loved: best.n > 0 ? best : null,
  };
}

export interface RegionCard {
  /** "Barolo" and "Piedmont" ("Barolo, *Piedmont*"); place empty when they're the same. */
  name: string;
  area: string;
  /** "Russian River Valley · United States", or just the country. */
  sub: string;
  knownFor: string;
  taste: string;
  forYou: string;
  /** The longer description from the wine's lesson, behind "Read more". */
  more: string;
  /** A real photo of the place, credited; null when there isn't a checked one. */
  photo: RegionPhoto | null;
}

export function regionCard(wine: Wine, all: Wine[], taste: TasteProfile | null, facts: CatalogFacts | null = null): RegionCard | null {
  const app = findAppellation(placeText(wine));
  const area = app?.area ?? wine.region.trim();
  const lines = regionLines(app?.name ?? null, area);
  if (!lines) return null;
  const here = (w: Wine) => {
    const a = findAppellation(placeText(w));
    return app ? a?.name === app.name : (a?.area ?? w.region.trim()) === area;
  };
  const loved = all.filter((w) => w.rating === 'loved' && w.list !== 'passed' && here(w));
  const fav = taste?.enough ? taste.likes.find((a) => a.kind === 'region' || a.kind === 'area') : undefined;
  const isFav = Boolean(fav && [app?.name, area].some((n) => n && n.toLowerCase() === fav.value.toLowerCase()));
  const allRed = loved.length > 0 && loved.every((w) => w.style === 'red');
  const forYou = isFav
    ? `Your favourite ${allRed ? 'red ' : ''}region.${loved.length ? ` ${loved.length} loved.` : ''}`
    : loved.length
      ? `You’ve loved ${loved.length} ${loved.length === 1 ? 'wine' : 'wines'} from here.`
      : '';
  const name = app?.name ?? area;
  const shownArea = app && app.area !== app.name ? app.area : '';
  // The catalog's sub-region, when it adds something ("Barolo" for a Barolo doesn't).
  const fold = (x: string) => x.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  const subregion = facts?.subregion ?? '';
  const adds = subregion && ![name, shownArea, wine.region, wine.country].some((x) => x && fold(x) === fold(subregion));
  return {
    name,
    area: shownArea,
    sub: [adds ? subregion : '', app?.country ?? wine.country].filter(Boolean).join(' · '),
    knownFor: lines.knownFor,
    taste: lines.taste,
    forYou,
    more: wine.lesson?.place?.trim() ?? '',
    photo: regionPhoto(app?.name ?? null, area),
  };
}
