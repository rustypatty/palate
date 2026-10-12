import type { Wine, WineStyle } from '../types';
import { canonicalGrape, factsFromText, findAppellation } from './appellations';
import { CRISP_PLACES, glassFor, type Glass } from './glass';
import { grapeTraits, guideName } from './grapeGuide';
import type { PalateProfile } from './profile';
import { regionLines } from './regionGuide';
import type { TasteProfile } from './taste';

/**
 * The Structure, Grapes and Region sections at the end of a wine page. All from Palate's own
 * grape and region guides and your ratings: nothing is asked of Claude, so they cost nothing.
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

/** The wine's grapes as the guide names them; the place's usual grapes when the wine names none. */
function grapesOf(wine: Wine): { grapes: string[]; usual: boolean } {
  const own = [...new Set(wine.grapes.map(canonicalGrape).filter(Boolean))];
  if (own.length) return { grapes: own, usual: false };
  const facts = factsFromText(placeText(wine));
  return { grapes: facts.grapes, usual: facts.grapes.length > 0 };
}

const level3 = (n: number, words: [string, string, string]) => (n <= 2 ? words[0] : n === 3 ? words[1] : words[2]);
const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

function prefText(p: PalateProfile | null, key: string): string {
  return p?.preferences.find((x) => (x.key ?? x.dimension.replace(/ /g, '_')) === key)?.value.toLowerCase() ?? '';
}

export function structureOf(wine: Wine, profile: PalateProfile | null): Structure | null {
  const { grapes } = grapesOf(wine);
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
  const names = known.map((x) => guideName(x.g)!).slice(0, 2);
  const line = `${STYLE_WORD[style]} · typical for ${names.join(' and ')}`;
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
  name: string;
  /** "100%" when it's the only grape, "Usually" when it's the place's usual grape; else ''. */
  share: string;
  taste: string;
  loved: number;
}

const lovedWith = (all: Wine[], grape: string) => all.filter((w) => w.rating === 'loved' && w.list !== 'passed' && w.grapes.some((g) => canonicalGrape(g) === grape)).length;

export function grapeCards(wine: Wine, all: Wine[]): { cards: GrapeCard[]; more: number } | null {
  const { grapes, usual } = grapesOf(wine);
  if (!grapes.length) return null;
  const cards = grapes.slice(0, 3).map((g) => ({
    name: guideName(g) ?? g,
    share: usual ? 'Usually' : grapes.length === 1 ? '100%' : '',
    taste: grapeTraits(g)?.taste ?? '',
    loved: lovedWith(all, canonicalGrape(g)),
  }));
  return { cards, more: Math.max(0, grapes.length - 3) };
}

export interface RegionCard {
  /** "Barolo" and "Piedmont" ("Barolo, *Piedmont*"); place empty when they're the same. */
  name: string;
  area: string;
  country: string;
  knownFor: string;
  taste: string;
  forYou: string;
  /** The longer description from the wine's lesson, behind "Read more". */
  more: string;
}

export function regionCard(wine: Wine, all: Wine[], taste: TasteProfile | null): RegionCard | null {
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
  return {
    name: app?.name ?? area,
    area: app && app.area !== app.name ? app.area : '',
    country: app?.country ?? wine.country,
    knownFor: lines.knownFor,
    taste: lines.taste,
    forYou,
    more: wine.lesson?.place?.trim() ?? '',
  };
}
