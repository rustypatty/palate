import { norm } from './catalogNorm';

/**
 * Picks the catalog wine a label or menu line names, from the candidates catalog_search returns.
 * Trigram similarity alone picks look-alikes (Castello di Bossi for Castello di Brolio), so:
 *  - every distinctive word of the query must be found in the candidate (near-spellings allowed);
 *  - words the candidate has and the query doesn't count against it (a second wine's "Petit" a lot);
 *  - entries that are the same wine under two spellings count as one;
 *  - if two different wines stay close, it's "uncertain": better no answer than the wrong bottle.
 */

export interface CatalogWine {
  wine_id: string;
  producer: string | null;
  cuvee: string | null;
  display_name: string | null;
  aliases: string[] | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  wine_type: string | null;
  grapes: string[] | null;
  identity_tier: string | null;
  source_count: number | null;
  min_usd_750: number | null;
  min_usd_750_seen_at: string | null;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  image_source_page_url: string | null;
  image_source_domain: string | null;
  similarity: number;
}

export interface CatalogQuery {
  producer?: string;
  /** Cuvée / wine name. */
  name?: string;
  /** Free text when producer and name aren't separate (a menu line). */
  text?: string;
  /** red, white, rose, sparkling… when the label makes it clear. */
  style?: string;
}

export type CatalogMatch =
  | { status: 'match'; wine: CatalogWine; score: number; /** The same wine's other entries (other shops' listings). */ others?: CatalogWine[] }
  | { status: 'uncertain'; options: CatalogWine[]; scores: number[] }
  | { status: 'none' };


const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

// Spellings that mean the same thing (both sides are mapped before comparing).
const CANON: Record<string, string> = {
  dom: 'domaine', domaines: 'domaine', ch: 'chateau', chateaux: 'chateau', chat: 'chateau', bodega: 'bodegas',
  saint: 'st', sainte: 'ste', sta: 'santa', mount: 'mt', monte: 'mt',
  riserva: 'reserva', reserve: 'reserva', gran: 'grand', grande: 'grand', grands: 'grand',
  vieilles: 'vv', vielles: 'vv', vieille: 'vv', viejas: 'vv', old: 'vv', alte: 'vv', vecchie: 'vv',
  premier: '1er', '1st': '1er', '1ere': '1er', selezione: 'sel', selection: 'sel', seleccion: 'sel',
  vineyard: 'vyd', vineyards: 'vyd', vigna: 'vyd', vigneto: 'vyd', vyds: 'vyd',
  sauv: 'sauvignon', chard: 'chardonnay', zin: 'zinfandel', gewurz: 'gewurztraminer', bros: 'brothers',
};

// Words that never tell two wines apart (menus' "house", shops' "gift box" included).
const FILLER = set(`de di del della dello dei degli delle du des d la le les l lo il el los las y e et and the of by en a da do dos das van von der den zu am im
wine wines vino vin vini vinho vinos cru cuvee vignes vines vigne nv vintage bottle bottles btl ml cl magnum half x pk pack case caja box gift
house glass carafe our`);

// Legal forms and titles: optional in the query, never counted against a candidate.
const LEGAL = set(`domaine chateau bodegas weingut tenuta tenute cantina cantine maison quinta herdade fattoria podere poderi azienda agricola az agr
cellars cellar winery estate estates family famille fils freres pere cie co sa srl spa ltd inc llc ag gmbh vignerons vigneron cave caves celler cellers ktima
societa soc vina vinedos vigneti tenimenti marchesi marchese barone famiglia fratelli figli sons brothers vyd`);

// Given names: menus and shelves drop them ("Mondavi" for Robert Mondavi, "Guigal" for E. Guigal).
const GIVEN = set(`robert louis joseph jean pierre paul georges george marcel henri michel andre francois jacques bernard alain philippe olivier
charles claude daniel denis etienne gerard guy jean luc marc patrick rene vincent yves antoine christophe emmanuel frederic laurent nicolas
giovanni giuseppe giacomo bruno luigi angelo mario paolo piero franco elio aldo alvaro miguel jose juan carlos pedro john james william thomas
richard david michael peter`);

// Shorthand on menus and shelf tags, spelled out on both sides before comparing.
const EXPAND: Record<string, string[]> = {
  cdr: ['cotes', 'rhone'],
  cdp: ['chateauneuf', 'pape'],
  sb: ['sauvignon', 'blanc'],
  kj: ['kendall', 'jackson'],
};

// Designations and classifications: optional in the query, cheap when a candidate adds them.
const DESIGNATION = set(`doc docg aoc aop igt igp dop doca vqa ava qba dc classe classified growth 1er superiore superieur gcc brut
5th 4th 3rd 2nd`);

const COLOUR: Record<string, string> = {
  rouge: 'red', red: 'red', rosso: 'red', tinto: 'red', erythros: 'red', erythro: 'red',
  white: 'white', bianco: 'white', blanco: 'white', branco: 'white', weiss: 'white', lefkos: 'white', lefko: 'white',
  rose: 'rose', rosato: 'rose', rosado: 'rose', roze: 'rose',
};
const GRAPE_BLANC = set('sauvignon pinot chenin grenache garnacha');

// Words that mark a second wine or a different bottling from the same estate.
const SECOND = set(`petit petite pavillon forts carruades clarence alter ego dame pagodes fiefs pensees blason marquis sarget benjamin
second seconde segundo secondo echo overture griffons chapelle comtesse hauts prelude`);

export const GRAPES = set(`cabernet sauvignon merlot pinot noir gris grigio blanc chardonnay syrah shiraz zinfandel primitivo malbec tempranillo
sangiovese nebbiolo riesling grenache garnacha garnatxa mourvedre monastrell carignan carinena cinsault gamay viognier marsanne roussanne chenin
semillon muscat moscato gewurztraminer gruner veltliner albarino alvarinho verdejo godello mencia touriga nacional barbera dolcetto corvina aglianico
nero avola montepulciano trebbiano vermentino fiano greco falanghina verdicchio carmenere pinotage sirah tannat franc verdot
torrontes bonarda xinomavro assyrtiko agiorgitiko moschofilero furmint blaufrankisch zweigelt lagrein schiava teroldego friulano ribolla glera
melon muscadet sylvaner silvaner kerner scheurebe mataro graciano viura macabeo xarel parellada airen palomino pedro ximenez tinta roriz blend`);

// Broad regions the catalog's own key drops (normalize_reference.py CUVEE_DROP), plus common appellations.
// (Results add any region several producers share; this list covers a search that returns only one.)
const PLACES = set(`france italy italia spain espana portugal greece germany austria australia argentina chile zealand africa usa
loire burgundy bourgogne piedmont piemonte tuscany toscana sicily sicilia california oregon washington catalonia catalunya galicia styria
steiermark niederosterreich veneto napa sonoma valley coast columbia mendoza barossa marlborough rioja douro bordeaux rhone cotes champagne
alsace provence langhe alba bolgheri chianti classico montalcino valle vallee
barolo barbaresco brunello amarone valpolicella soave prosecco franciacorta etna montepulciano abruzzo taurasi
chablis sancerre pouilly fume fuisse meursault puligny chassagne montrachet gevrey chambertin nuits beaune pommard volnay vosne romanee
chambolle musigny morey vougeot corton santenay mercurey givry rully macon villages beaujolais morgon fleurie brouilly julienas
medoc margaux pauillac julien estephe pomerol emilion pessac leognan graves sauternes listrac moulis fronsac
hermitage crozes cornas rotie condrieu chateauneuf pape gigondas vacqueyras rasteau lirac tavel bandol cassis
vouvray chinon bourgueil saumur muscadet anjou savennieres cremant
ribera duero priorat toro rueda rias baixas bierzo jerez navarra
mclaren yarra willamette paso robles russian lodi otago hawkes
stellenbosch swartland maipo colchagua casablanca uco wachau kamptal mosel rheingau pfalz santorini nemea`);

const isYear = (t: string) => /^(19|20)\d\d$/.test(t);
const isJunk = (t: string) => /^\d+(ml|cl|l|lt|ltr|pk|x|btl|btls)$/.test(t) || /^x\d+$/.test(t) || /^[a-z]{1,3}\d{2,3}$/.test(t);
// Single letters ("R. López"), one- or two-digit numbers ("24 Mercurey" = 2024, "6 x"), critics' initials, "GL" (by the glass).
const MINOR = set('wa ws js jd rp vm we wh gl');
const isMinor = (t: string) => t.length === 1 || /^\d{1,2}$/.test(t) || MINOR.has(t);
const ARTICLE = set('l d la le de du di');

function canon(t: string): string {
  return CANON[t] ?? t;
}

function tokens(s: string | null | undefined): string[] {
  const n = norm(s)
    .replace(/\bblanc de blancs?\b/g, 'bdb')
    .replace(/\bblanc de noirs?\b/g, 'bdn');
  const raw = n.split(' ').filter(Boolean).map(canon);
  return raw.flatMap((t, i) => {
    if (t === 'cab') return ['sauvignon', 'franc'].includes(raw[i + 1]) ? ['cabernet'] : ['cabernet', 'sauvignon'];
    return EXPAND[t] ?? [t];
  });
}

/** At most one edit apart (insert, delete, substitute, or swap two neighbours). */
function oneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let i = 0;
    while (i < la && a[i] === b[i]) i++;
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swap
  }
  const [s, l] = la < lb ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1);
}

type Near = 'sub' | 'other';

/**
 * Near-spellings: Organic/Organica, Vielles/Vieilles, Mazzie/Mazzei, Larose/La Rose, d'Avola/di Avola.
 * 'sub' = one letter replaced by another, which is as often a different name (Rovello/Revello) as a typo.
 */
function near(q: string, w: string): Near | null {
  if (q.length >= 4 && w.length >= 4 && Math.abs(q.length - w.length) <= 2 && (w.startsWith(q) || q.startsWith(w))) return 'other';
  if (q.length >= 5 && w.length >= 5 && oneEdit(q, w)) {
    if (q.length !== w.length) return 'other';
    const diff = [...q].filter((c, i) => c !== w[i]).length;
    return diff === 1 ? 'sub' : 'other';
  }
  // A letter dropped or doubled in a short name: Massi/Masi.
  if (Math.min(q.length, w.length) >= 4 && Math.max(q.length, w.length) >= 5 && q.length !== w.length && oneEdit(q, w)) return 'other';
  const [s, l] = q.length < w.length ? [q, w] : [w, q];
  return s.length >= 4 && l.endsWith(s) && ARTICLE.has(l.slice(0, l.length - s.length)) ? 'other' : null;
}

/** Finds a query word among a candidate's words not already used by another query word. */
function findWord(q: string, words: string[], taken: Set<number>): { near: Near | null; used: number[] } | null {
  for (let j = 0; j < words.length; j++) if (!taken.has(j) && words[j] === q) return { near: null, used: [j] };
  for (let j = 0; j < words.length; j++) {
    if (taken.has(j)) continue;
    const n = near(q, words[j]);
    if (n) return { near: n, used: [j] };
    // "Saint-Émilion" written as one word.
    if (j + 1 < words.length && !taken.has(j + 1) && q.length >= 6 && words[j] + words[j + 1] === q) return { near: 'other', used: [j, j + 1] };
  }
  return null;
}

interface QueryWords {
  /** Words that must be found, repeats kept ("Produttori del Barbaresco Barbaresco" needs Barbaresco twice). */
  words: string[];
  /** Colour or type: from the label reader, or a colour word in the text. */
  type: string | null;
  /** Colour words the text itself states. */
  colours: Set<string>;
  /** What catalog_search gets: cleaned words, abbreviations spelled out, no years. */
  text: string;
}

export function queryWords(q: CatalogQuery): QueryWords {
  const raw = [q.producer, q.name, q.text].filter(Boolean).join(' ');
  const all = tokens(raw);
  let type: string | null = q.style && q.style !== 'unknown' ? q.style : null;
  const colours = new Set<string>();
  const words: string[] = [];
  all.forEach((t, i) => {
    if (t === 'blanc') {
      // "Blanc" alone is the colour; after Sauvignon/Pinot/Chenin it's part of the grape.
      if (i > 0 && GRAPE_BLANC.has(all[i - 1])) words.push(t);
      else colours.add('white');
      return;
    }
    if (t in COLOUR) {
      colours.add(COLOUR[t]);
      return;
    }
    if (FILLER.has(t) || isYear(t) || isJunk(t)) return;
    words.push(t);
  });
  if (!type && colours.size === 1) type = [...colours][0];
  if (!type && words.some((w) => ['brut', 'champagne', 'prosecco', 'cava', 'cremant', 'bdb', 'bdn'].includes(w))) type = 'sparkling';
  const text = all.filter((t) => !isYear(t) && !isJunk(t)).join(' ');
  return { words, type, colours, text };
}

/** The text to send to catalog_search for this query. */
export function catalogSearchText(q: CatalogQuery): string {
  return queryWords(q).text;
}

/**
 * A second, narrower search text for when the first search matches nothing: only the words that
 * name this wine, without the places the first results show are shared ("protos crianza", not
 * "protos ribera del duero crianza"). Null if it would be the same search.
 */
export function catalogFallbackText(q: CatalogQuery, firstResults: CatalogWine[] = []): string | null {
  const { text, words } = queryWords(q);
  const places = batchPlaces(firstResults);
  const narrow = [...new Set(words.filter((t) => !GRAPES.has(t) && !places.has(t) && !DESIGNATION.has(t) && !LEGAL.has(t) && !isMinor(t)))].join(' ');
  return narrow && narrow !== text ? narrow : null;
}

/** Red, white and rosé never stand in for each other; other types are filed loosely, so they don't block. */
function typeClash(a: string | null, b: string | null): boolean {
  if (!a || !b || a === 'unknown' || b === 'unknown' || a === b) return false;
  const strict = new Set(['red', 'white', 'rose']);
  return strict.has(a) && strict.has(b);
}

function placeWords(w: CatalogWine): Set<string> {
  return new Set([...tokens(w.country), ...tokens(w.region), ...tokens(w.appellation)]);
}

const keep = (t: string) => !FILLER.has(t) && !(t in COLOUR) && !isYear(t) && !isJunk(t);

interface Ctx {
  q: QueryWords;
  qset: Set<string>;
  mentionsGrape: boolean;
  places: Set<string>;
  generic: (t: string) => boolean;
}

function scoreCandidate(w: CatalogWine, ctx: Ctx): { score: number; penalty: number; colours: string[] } | null {
  const prodRaw = tokens(w.producer);
  const cuvRaw = tokens(w.cuvee);
  const prod = prodRaw.filter(keep);
  const cuv = cuvRaw.filter(keep);
  const name = [...prod, ...cuv];
  const nProd = prod.length;
  const grapes = new Set((w.grapes ?? []).flatMap((g) => tokens(g)));
  // A grape the label names but the catalog's name doesn't: fine for a one-grape wine (Zisola is Nero d'Avola),
  // not for a blend that merely contains it ("Monte Bello Merlot" is not Monte Bello).
  const oneGrape = (w.grapes ?? []).length <= 1;
  const context = [...new Set([...placeWords(w), ...(oneGrape ? grapes : []), ...tokens(w.wine_type)])];
  const aliasWords = [...new Set([...tokens(w.display_name), ...(w.aliases ?? []).flatMap((a) => tokens(a))])];

  const taken = new Set<number>();
  let penalty = 0;
  let distinctive = false;
  let exactDistinctive = false;
  let subDistinctive = false;
  for (const q of ctx.q.words) {
    const f = findWord(q, name, taken);
    if (f) {
      f.used.forEach((i) => taken.add(i));
      if (f.near) penalty += 0.02;
      if (!ctx.generic(q) && !LEGAL.has(q)) {
        if (f.near === 'sub') subDistinctive = true;
        else if (!f.near) exactDistinctive = true;
        if (!cuv.length || f.used.some((i) => i >= nProd)) distinctive = true;
      }
      continue;
    }
    if (LEGAL.has(q) || DESIGNATION.has(q)) continue; // "Domaine" or "DOCG" on the label, not in the catalog's name
    if (context.some((c) => c === q || near(q, c))) continue; // a region or grape the name leaves out
    // Shops' titles can carry words the catalog's name doesn't; trust them a little less.
    if (aliasWords.some((a) => a === q || near(q, a))) {
      penalty += SECOND.has(q) ? 0.3 : 0.05;
      continue;
    }
    return null;
  }
  // "Rovello" is not "Revello" unless something else about the name matches exactly.
  if (subDistinctive && !exactDistinctive) return null;

  let prodExtras = 0;
  name.forEach((t, i) => {
    // A lone "Blanc" is a colour, charged below with the other colours.
    if (taken.has(i) || ctx.qset.has(t) || LEGAL.has(t) || isMinor(t) || t === 'blanc') return;
    if (SECOND.has(t)) penalty += 0.3;
    else if (i < nProd && GIVEN.has(t)) penalty += 0.07;
    else if (i < nProd) prodExtras++;
    else if (DESIGNATION.has(t)) penalty += 0.01;
    else if (GRAPES.has(t) || grapes.has(t)) penalty += ctx.mentionsGrape ? 0.1 : 0.06;
    else if (ctx.places.has(t)) penalty += 0.02;
    else penalty += 0.1;
  });
  // A producer word the query lacks is fine when the query named the wine itself
  // ("Whispering Angel" for Château d'Esclans), not when it only named a grape or place
  // ("Catena Malbec" is not "Catena Alta Malbec").
  penalty += prodExtras * (distinctive ? 0.05 : 0.3);

  const candColours = nameColours(prodRaw, cuvRaw);
  // A colour the query doesn't state: a clash with its type costs a lot, otherwise a little (Ornellaia vs Ornellaia Bianco).
  candColours.forEach((c) => {
    if (ctx.q.colours.has(c)) return;
    if (c !== ctx.q.type) penalty += ctx.q.type ? 0.2 : 0.1;
  });
  ctx.q.colours.forEach((c) => {
    if (w.wine_type && w.wine_type !== c && !candColours.includes(c)) penalty += 0.1;
  });

  return { score: 1 - penalty + 0.02 * Math.log(1 + (w.source_count ?? 0)), penalty, colours: candColours };
}

/** Colours the name itself states: "Rouge", "Rosé", a lone "Blanc" (not Sauvignon Blanc). */
function nameColours(prod: string[], cuv: string[]): string[] {
  const all = [...prod, ...cuv];
  const out = new Set<string>();
  all.forEach((t, i) => {
    if (t in COLOUR) out.add(COLOUR[t]);
    else if (t === 'blanc' && !(i > 0 && GRAPE_BLANC.has(all[i - 1]))) out.add('white');
  });
  return [...out];
}

interface Core {
  words: string[];
  producer: Set<string>;
  /** red / rose when the name or type says so, '' for the rest (whites and sparkling are filed too loosely to tell apart), '?' when unknown. */
  colour: string;
}

/** A candidate's distinctive words, for telling whether two entries are the same wine. */
function coreOf(w: CatalogWine, places: Set<string>): Core {
  const isPlace = (t: string) => places.has(t) || [...places].some((p) => p.length >= 5 && near(t, p) === 'other');
  const ok = (t: string) => keep(t) && t !== 'blanc' && !LEGAL.has(t) && !isMinor(t) && !DESIGNATION.has(t) && !isPlace(t);
  const prodRaw = tokens(w.producer);
  const cuvRaw = tokens(w.cuvee);
  const producer = new Set(prodRaw.filter(ok));
  const words = [...new Set([...producer, ...cuvRaw.filter(ok)])];
  const colours = nameColours(prodRaw, cuvRaw);
  const colour =
    colours.includes('rose') || w.wine_type === 'rose' ? 'rose' : colours.includes('red') || w.wine_type === 'red' ? 'red' : colours.length || w.wine_type ? '' : '?';
  return { words, producer, colour };
}

// A word, a near-spelling of it, or two words run together ("Cake Bread" for Cakebread).
const hasWord = (list: string[], t: string) =>
  list.some((x, i) => x === t || near(t, x) === 'other' || (i + 1 < list.length && x + list[i + 1] === t));

/**
 * Same wine listed twice: the same distinctive words (allowing a shop's typo) and colour, or one entry
 * adds only words in its producer field (a merchant filed as producer: "Vintus | Marqués de Riscal Reserva").
 */
function sameWine(a: Scored, b: Scored): boolean {
  if (a.core.colour !== b.core.colour && a.core.colour !== '?' && b.core.colour !== '?') return false;
  // Grapes only tell two entries apart when both name one ("Finca Altamira" with or without "Malbec" is one wine).
  const named = (c: Core) => c.words.some((t) => GRAPES.has(t));
  const soft = !named(a.core) || !named(b.core);
  const covers = (big: Core, small: Core) => {
    const counts = (t: string) => !(soft && GRAPES.has(t));
    return (
      small.words.filter(counts).every((t) => hasWord(big.words, t)) &&
      big.words.filter(counts).every((t) => hasWord(small.words, t) || big.producer.has(t))
    );
  };
  return covers(a.core, b.core) || covers(b.core, a.core);
}

interface Scored {
  wine: CatalogWine;
  score: number;
  core: Core;
  /** Colours its name states. */
  colours: string[];
}

export const MARGIN = 0.05;
/** More than this much difference from the query and it isn't the wine (a second wine's "Dame" is 0.3). */
const MAX_PENALTY = 0.25;

/** Region and appellation words shared by several producers in these results, plus the common ones. */
function batchPlaces(candidates: CatalogWine[]): Set<string> {
  const places = new Set(PLACES);
  const producers = new Map<string, Set<string>>();
  candidates.forEach((c) =>
    placeWords(c).forEach((t) => {
      const ps = producers.get(t) ?? new Set<string>();
      ps.add(c.producer ?? '');
      producers.set(t, ps);
    }),
  );
  producers.forEach((ps, t) => ps.size >= 2 && places.add(t));
  return places;
}

export function rankCatalog(query: CatalogQuery, candidates: CatalogWine[]): CatalogMatch {
  const q = queryWords(query);
  if (!q.words.length || !candidates.length) return { status: 'none' };
  // Place words: one wine's own name in its appellation field (as with Pétrus) doesn't make it a place.
  const places = batchPlaces(candidates);
  const generic = (t: string) => GRAPES.has(t) || places.has(t) || DESIGNATION.has(t);
  // A menu line of only places and grapes ("Chablis", "Napa Cabernet") names no particular wine.
  // "Château Margaux" does: a legal form or a separate producer says it's a name.
  if (!query.producer && !q.words.some((t) => LEGAL.has(t)) && q.words.every((t) => generic(t))) return { status: 'none' };

  const ctx: Ctx = { q, qset: new Set(q.words), mentionsGrape: q.words.some((t) => GRAPES.has(t)), places, generic };
  const scored: Scored[] = [];
  for (const w of candidates) {
    if (typeClash(q.type, w.wine_type)) continue;
    const s = scoreCandidate(w, ctx);
    if (s && s.penalty <= MAX_PENALTY + 1e-9) scored.push({ wine: w, score: s.score, core: coreOf(w, places), colours: s.colours });
  }
  if (!scored.length) return { status: 'none' };

  scored.sort((a, b) => b.score - a.score || (b.wine.source_count ?? 0) - (a.wine.source_count ?? 0));
  const groups: Scored[][] = [];
  for (const s of scored) {
    const g = groups.find((g) => sameWine(g[0], s));
    if (g) g.push(s);
    else groups.push([s]);
  }

  // Within one wine's entries, show the one that best fits: the label's colour, then a real producer
  // name over a shop's "375ml" or "1.5L" listing, then the best score.
  const sizeOnly = (w: CatalogWine) => !tokens(w.producer).some((t) => keep(t) && !isMinor(t));
  const fit = (s: Scored) => s.score + (q.type && s.wine.wine_type === q.type ? 0.05 : 0) - (sizeOnly(s.wine) ? 0.05 : 0);
  groups.forEach((g) => g.sort((a, b) => fit(b) - fit(a)));
  groups.sort((a, b) => Math.max(...b.map((s) => s.score)) - Math.max(...a.map((s) => s.score)));
  const best = (g: Scored[]) => Math.max(...g.map((s) => s.score));

  const top = groups[0];
  const runner = groups[1];
  if (runner && best(top) - best(runner) < MARGIN - 1e-9) {
    const shown = groups.slice(0, 3);
    return { status: 'uncertain', options: shown.map((g) => g[0].wine), scores: shown.map(best) };
  }
  // "Montrose Blanc": when the text names a colour, the catalog must confirm it, by type or by name.
  for (const c of q.colours) {
    if (top[0].wine.wine_type !== c && !top[0].colours.includes(c)) {
      return { status: 'uncertain', options: groups.slice(0, 3).map((g) => g[0].wine), scores: groups.slice(0, 3).map(best) };
    }
  }
  // Best entry, with a photo borrowed from a duplicate entry if it has none.
  const wine = { ...top[0].wine };
  if (!wine.image_url) {
    const withImage = top.find((s) => s.wine.image_url);
    if (withImage) {
      const i = withImage.wine;
      Object.assign(wine, {
        image_url: i.image_url,
        image_width: i.image_width,
        image_height: i.image_height,
        image_source_page_url: i.image_source_page_url,
        image_source_domain: i.image_source_domain,
      });
    }
  }
  return { status: 'match', wine, score: best(top), others: top.slice(1).map((s) => s.wine) };
}

/** Candidate wines from the catalog's search function (Supabase RPC, public read-only). */
export async function searchCatalogAt(baseUrl: string, key: string, text: string, lim = 25, signal?: AbortSignal): Promise<CatalogWine[]> {
  const res = await fetch(`${baseUrl}/rest/v1/rpc/catalog_search`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, lim }),
    signal,
  });
  if (!res.ok) throw new Error(`catalog_search ${res.status} ${(await res.text()).slice(0, 200)} for "${text}"`);
  return (await res.json()) as CatalogWine[];
}

/**
 * Looks a wine up: one search, and if that matches nothing, a second with only the distinctive
 * words ("mazzie zisola" finds Mazzei's Zisola when "nero di avola" crowds it out).
 */
export async function lookupCatalog(q: CatalogQuery, search: (text: string) => Promise<CatalogWine[]>): Promise<{ match: CatalogMatch; candidates: CatalogWine[] }> {
  let candidates = await search(catalogSearchText(q));
  let match = rankCatalog(q, candidates);
  const narrow = match.status === 'none' ? catalogFallbackText(q, candidates) : null;
  if (narrow) {
    const seen = new Set(candidates.map((c) => c.wine_id));
    candidates = [...candidates, ...(await search(narrow)).filter((c) => !seen.has(c.wine_id))];
    match = rankCatalog(q, candidates);
  }
  return { match, candidates };
}
