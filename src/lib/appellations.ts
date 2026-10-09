import type { WineStyle } from '../types';
import { tokens } from './text';

/**
 * A small guide to well-known appellations, so a shop listing like
 * "Domaine X Gigondas 2021" can be connected to the Châteauneuf-du-Pape you liked
 * (same area, same typical grapes) even though it never names a grape.
 * "Typical grapes" are what the appellation is usually made from — never shown
 * as fact on a saved wine, only used for matching and worded as "usually".
 */

export interface Appellation {
  name: string;
  area: string;
  country: string;
  grapes: string[];
  /** Set only when the appellation (almost) always means one style. */
  style?: WineStyle;
  /** Other names it goes by, e.g. "Port" for Porto. */
  aliases?: string[];
}

function a(name: string, area: string, country: string, grapes: string[] = [], style?: WineStyle, aliases: string[] = []): Appellation[] {
  return [{ name, area, country, grapes, style, aliases }];
}

const GSM = ['Grenache', 'Syrah', 'Mourvèdre'];
const LEFT_BANK = ['Cabernet Sauvignon', 'Merlot'];
const RIGHT_BANK = ['Merlot', 'Cabernet Franc'];

const LIST: Appellation[] = [
  // Southern Rhône
  ...a('Châteauneuf-du-Pape', 'Southern Rhône', 'France', GSM),
  ...a('Gigondas', 'Southern Rhône', 'France', ['Grenache', 'Syrah'], 'red'),
  ...a('Vacqueyras', 'Southern Rhône', 'France', ['Grenache', 'Syrah']),
  ...a('Rasteau', 'Southern Rhône', 'France', ['Grenache', 'Syrah']),
  ...a('Cairanne', 'Southern Rhône', 'France', ['Grenache', 'Syrah']),
  ...a('Lirac', 'Southern Rhône', 'France', GSM),
  ...a('Vinsobres', 'Southern Rhône', 'France', ['Grenache', 'Syrah']),
  ...a('Côtes du Rhône', 'Southern Rhône', 'France', ['Grenache', 'Syrah']),
  ...a('Ventoux', 'Southern Rhône', 'France', ['Grenache', 'Syrah']),
  ...a('Tavel', 'Southern Rhône', 'France', ['Grenache'], 'rose'),
  // Northern Rhône (easier-to-find names first: the wine passport suggests the first few)
  ...a('Crozes-Hermitage', 'Northern Rhône', 'France', ['Syrah']),
  ...a('Saint-Joseph', 'Northern Rhône', 'France', ['Syrah']),
  ...a('Cornas', 'Northern Rhône', 'France', ['Syrah'], 'red'),
  ...a('Côte-Rôtie', 'Northern Rhône', 'France', ['Syrah'], 'red'),
  ...a('Hermitage', 'Northern Rhône', 'France', ['Syrah']),
  ...a('Condrieu', 'Northern Rhône', 'France', ['Viognier'], 'white'),
  // Bordeaux
  ...a('Pauillac', 'Bordeaux', 'France', LEFT_BANK, 'red'),
  ...a('Margaux', 'Bordeaux', 'France', LEFT_BANK, 'red'),
  ...a('Saint-Julien', 'Bordeaux', 'France', LEFT_BANK, 'red'),
  ...a('Saint-Estèphe', 'Bordeaux', 'France', LEFT_BANK, 'red'),
  ...a('Haut-Médoc', 'Bordeaux', 'France', LEFT_BANK, 'red'),
  ...a('Médoc', 'Bordeaux', 'France', LEFT_BANK, 'red'),
  ...a('Pessac-Léognan', 'Bordeaux', 'France', LEFT_BANK),
  ...a('Saint-Émilion', 'Bordeaux', 'France', RIGHT_BANK, 'red'),
  ...a('Pomerol', 'Bordeaux', 'France', ['Merlot'], 'red'),
  ...a('Côtes de Bourg', 'Bordeaux', 'France', RIGHT_BANK, 'red'),
  ...a('Castillon', 'Bordeaux', 'France', RIGHT_BANK, 'red'),
  ...a('Sauternes', 'Bordeaux', 'France', ['Sémillon', 'Sauvignon Blanc'], 'dessert'),
  ...a('Bordeaux', 'Bordeaux', 'France', ['Merlot', 'Cabernet Sauvignon']),
  // Burgundy & Beaujolais
  ...a('Chablis', 'Burgundy', 'France', ['Chardonnay'], 'white'),
  ...a('Meursault', 'Burgundy', 'France', ['Chardonnay'], 'white'),
  ...a('Puligny-Montrachet', 'Burgundy', 'France', ['Chardonnay'], 'white'),
  ...a('Chassagne-Montrachet', 'Burgundy', 'France', ['Chardonnay']),
  ...a('Pouilly-Fuissé', 'Burgundy', 'France', ['Chardonnay'], 'white'),
  ...a('Mâcon', 'Burgundy', 'France', ['Chardonnay']),
  ...a('Gevrey-Chambertin', 'Burgundy', 'France', ['Pinot Noir'], 'red'),
  ...a('Nuits-Saint-Georges', 'Burgundy', 'France', ['Pinot Noir']),
  ...a('Vosne-Romanée', 'Burgundy', 'France', ['Pinot Noir'], 'red'),
  ...a('Chambolle-Musigny', 'Burgundy', 'France', ['Pinot Noir'], 'red'),
  ...a('Pommard', 'Burgundy', 'France', ['Pinot Noir'], 'red'),
  ...a('Volnay', 'Burgundy', 'France', ['Pinot Noir'], 'red'),
  ...a('Santenay', 'Burgundy', 'France', ['Pinot Noir']),
  ...a('Mercurey', 'Burgundy', 'France', ['Pinot Noir']),
  ...a('Givry', 'Burgundy', 'France', ['Pinot Noir']),
  ...a('Bourgogne', 'Burgundy', 'France', [], undefined, ['Burgundy']),
  ...a('Morgon', 'Beaujolais', 'France', ['Gamay'], 'red'),
  ...a('Fleurie', 'Beaujolais', 'France', ['Gamay'], 'red'),
  ...a('Moulin-à-Vent', 'Beaujolais', 'France', ['Gamay'], 'red'),
  ...a('Brouilly', 'Beaujolais', 'France', ['Gamay'], 'red'),
  ...a('Beaujolais', 'Beaujolais', 'France', ['Gamay']),
  // Loire, Alsace, Champagne, south
  ...a('Sancerre', 'Loire', 'France', ['Sauvignon Blanc']),
  ...a('Pouilly-Fumé', 'Loire', 'France', ['Sauvignon Blanc'], 'white'),
  ...a('Vouvray', 'Loire', 'France', ['Chenin Blanc'], 'white'),
  ...a('Savennières', 'Loire', 'France', ['Chenin Blanc'], 'white'),
  ...a('Chinon', 'Loire', 'France', ['Cabernet Franc']),
  ...a('Muscadet', 'Loire', 'France', ['Melon de Bourgogne'], 'white'),
  ...a('Alsace', 'Alsace', 'France'),
  ...a('Champagne', 'Champagne', 'France', [], 'sparkling'),
  ...a('Crémant', 'France (sparkling)', 'France', [], 'sparkling'),
  ...a('Bandol', 'Provence', 'France', ['Mourvèdre']),
  ...a('Côtes de Provence', 'Provence', 'France', ['Grenache', 'Cinsault'], 'rose'),
  ...a('Languedoc', 'Languedoc', 'France', ['Grenache', 'Syrah']),
  ...a('Cahors', 'South-West France', 'France', ['Malbec'], 'red'),
  // Italy
  ...a('Barolo', 'Piedmont', 'Italy', ['Nebbiolo'], 'red'),
  ...a('Barbaresco', 'Piedmont', 'Italy', ['Nebbiolo'], 'red'),
  ...a('Langhe', 'Piedmont', 'Italy'),
  ...a('Gattinara', 'Piedmont', 'Italy', ['Nebbiolo'], 'red'),
  ...a("Barbera d'Alba", 'Piedmont', 'Italy', ['Barbera'], 'red'),
  ...a("Barbera d'Asti", 'Piedmont', 'Italy', ['Barbera'], 'red'),
  ...a('Gavi', 'Piedmont', 'Italy', ['Cortese'], 'white'),
  ...a('Chianti Classico', 'Tuscany', 'Italy', ['Sangiovese'], 'red'),
  ...a('Chianti', 'Tuscany', 'Italy', ['Sangiovese'], 'red'),
  ...a('Brunello di Montalcino', 'Tuscany', 'Italy', ['Sangiovese'], 'red'),
  ...a('Rosso di Montalcino', 'Tuscany', 'Italy', ['Sangiovese'], 'red'),
  ...a('Vino Nobile di Montepulciano', 'Tuscany', 'Italy', ['Sangiovese'], 'red'),
  ...a('Bolgheri', 'Tuscany', 'Italy', ['Cabernet Sauvignon', 'Merlot']),
  ...a('Toscana', 'Tuscany', 'Italy', [], undefined, ['Tuscany']),
  ...a('Amarone', 'Veneto', 'Italy', ['Corvina'], 'red'),
  ...a('Valpolicella', 'Veneto', 'Italy', ['Corvina'], 'red'),
  ...a('Soave', 'Veneto', 'Italy', ['Garganega'], 'white'),
  ...a('Prosecco', 'Veneto', 'Italy', ['Glera'], 'sparkling'),
  ...a('Etna', 'Sicily', 'Italy', ['Nerello Mascalese']),
  ...a("Montepulciano d'Abruzzo", 'Abruzzo', 'Italy', ['Montepulciano'], 'red'),
  // Spain & Portugal
  ...a('Rioja', 'Rioja', 'Spain', ['Tempranillo']),
  ...a('Ribera del Duero', 'Ribera del Duero', 'Spain', ['Tempranillo'], 'red'),
  ...a('Toro', 'Castilla y León', 'Spain', ['Tempranillo'], 'red'),
  ...a('Priorat', 'Catalonia', 'Spain', ['Grenache', 'Carignan'], 'red'),
  ...a('Rías Baixas', 'Galicia', 'Spain', ['Albariño'], 'white'),
  ...a('Bierzo', 'Castilla y León', 'Spain', ['Mencía']),
  ...a('Rueda', 'Castilla y León', 'Spain', ['Verdejo'], 'white'),
  ...a('Cava', 'Spain (sparkling)', 'Spain', [], 'sparkling'),
  ...a('Jerez', 'Andalusia', 'Spain', ['Palomino'], 'fortified', ['Sherry']),
  ...a('Douro', 'Douro', 'Portugal', ['Touriga Nacional']),
  ...a('Vinho Verde', 'Minho', 'Portugal', [], 'white'),
  ...a('Porto', 'Douro', 'Portugal', ['Touriga Nacional'], 'fortified', ['Port']),
  // Germany & Austria
  ...a('Mosel', 'Mosel', 'Germany', ['Riesling'], 'white'),
  ...a('Rheingau', 'Rheingau', 'Germany', ['Riesling'], 'white'),
  ...a('Pfalz', 'Pfalz', 'Germany'),
  ...a('Wachau', 'Wachau', 'Austria', [], 'white'),
  // New World
  ...a('Napa Valley', 'Napa', 'United States', [], undefined, ['Napa']),
  ...a('Sonoma Coast', 'Sonoma', 'United States'),
  ...a('Russian River Valley', 'Sonoma', 'United States'),
  ...a('Sonoma County', 'Sonoma', 'United States', [], undefined, ['Sonoma']),
  ...a('Dry Creek Valley', 'Sonoma', 'United States'),
  ...a('Paso Robles', 'Central Coast', 'United States'),
  ...a('Santa Rita Hills', 'Central Coast', 'United States'),
  ...a('Willamette Valley', 'Oregon', 'United States', ['Pinot Noir'], undefined, ['Willamette']),
  ...a('Mendoza', 'Mendoza', 'Argentina', ['Malbec']),
  ...a('Barossa', 'South Australia', 'Australia', ['Syrah']),
  ...a('McLaren Vale', 'South Australia', 'Australia', ['Syrah']),
  ...a('Marlborough', 'Marlborough', 'New Zealand', ['Sauvignon Blanc']),
  ...a('Central Otago', 'Central Otago', 'New Zealand', ['Pinot Noir']),
];

/** Every appellation in the guide, in its order (by area). */
export const APPELLATIONS: readonly Appellation[] = LIST;

const keyOf = (s: string) => ` ${tokens(s).join(' ')} `;
const INDEX = LIST.flatMap((x) => [x.name, ...(x.aliases ?? [])].map((n) => ({ x, key: keyOf(n), len: tokens(n).length }))).sort(
  (p, q) => q.len - p.len,
);

/** The most specific appellation named in the text, e.g. "Crozes-Hermitage" over "Hermitage". */
export function findAppellation(text: string): Appellation | null {
  const hay = keyOf(text);
  return INDEX.find((e) => hay.includes(e.key))?.x ?? null;
}

// Grape names and their common synonyms → one canonical name.
const GRAPE_ALIASES: Record<string, string[]> = {
  // White grapes whose names contain a red one: matched first because they're longer.
  'Grenache Blanc': ['Garnacha Blanca', 'Garnatxa Blanca'],
  'Pinot Blanc': ['Pinot Bianco'],
  Viura: ['Macabeo'],
  Grenache: ['Garnacha', 'Garnacha Tinta', 'Grenache Noir', 'Cannonau', 'Garnatxa'],
  Syrah: ['Shiraz'],
  Mourvèdre: ['Monastrell', 'Mataro'],
  Carignan: ['Cariñena', 'Mazuelo', 'Carignano', 'Samsó'],
  Tempranillo: ['Tinto Fino', 'Tinta de Toro', 'Tinta Roriz', 'Tinto del País'],
  Zinfandel: ['Primitivo'],
  'Pinot Gris': ['Pinot Grigio'],
  'Cabernet Sauvignon': ['Cab Sauv'],
  'Sauvignon Blanc': ['Sauv Blanc', 'Fumé Blanc'],
  Albariño: ['Alvarinho'],
  Malbec: ['Côt'],
  'Pinot Noir': ['Spätburgunder', 'Pinot Nero'],
  Sémillon: ['Semillon'],
  Mencía: [],
  Nebbiolo: [],
  Sangiovese: [],
  Barbera: [],
  Merlot: [],
  'Cabernet Franc': [],
  Chardonnay: [],
  Riesling: [],
  'Chenin Blanc': [],
  Viognier: [],
  Gamay: [],
  Cinsault: ['Cinsaut'],
  'Grüner Veltliner': ['Gruner'],
  Gewürztraminer: [],
  'Touriga Nacional': [],
  Corvina: [],
  Verdejo: [],
  Graciano: [],
  Counoise: [],
  'Petite Sirah': [],
  'Petit Verdot': [],
  Carménère: [],
  Aglianico: [],
  Montepulciano: [],
  'Nerello Mascalese': [],
  Glera: [],
  Cortese: [],
  Garganega: [],
  'Melon de Bourgogne': [],
  Palomino: [],
};

const GRAPE_INDEX = Object.entries(GRAPE_ALIASES)
  .flatMap(([canon, al]) => [canon, ...al].map((n) => ({ canon, key: keyOf(n), len: tokens(n).length })))
  .sort((p, q) => q.len - p.len);

const CANON = new Map(GRAPE_INDEX.map((g) => [g.key, g.canon]));

/** "Garnacha" → "Grenache", "Shiraz" → "Syrah"; unknown names pass through. */
export function canonicalGrape(name: string): string {
  return CANON.get(keyOf(name)) ?? name.trim();
}

/** Grape varieties named in free text (canonical names, longest names first). */
export function findGrapes(text: string): string[] {
  let hay = keyOf(text);
  const found: string[] = [];
  for (const g of GRAPE_INDEX) {
    if (!hay.includes(g.key)) continue;
    // Montepulciano the grape vs. "Vino Nobile di Montepulciano" the place.
    if (g.canon === 'Montepulciano' && / nobile di montepulciano /.test(hay)) continue;
    if (!found.includes(g.canon)) found.push(g.canon);
    hay = hay.replace(g.key, ' ');
  }
  return found;
}

export interface WineFacts {
  appellation: Appellation | null;
  area: string;
  country: string;
  /** Grapes named in the text. */
  namedGrapes: string[];
  /** Grapes named, or else the appellation's usual grapes. */
  grapes: string[];
  grapesInferred: boolean;
  style: WineStyle | null;
}

/** What can be told about a wine from its name/region text alone. */
export function factsFromText(text: string): WineFacts {
  const appellation = findAppellation(text);
  const namedGrapes = findGrapes(text);
  const inferred = namedGrapes.length === 0 && Boolean(appellation?.grapes.length);
  return {
    appellation,
    area: appellation?.area ?? '',
    country: appellation?.country ?? '',
    namedGrapes,
    grapes: inferred ? appellation!.grapes : namedGrapes,
    grapesInferred: inferred,
    style: appellation?.style ?? null,
  };
}
