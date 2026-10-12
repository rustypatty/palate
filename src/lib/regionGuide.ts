/**
 * What a wine region is known for and how its wines usually taste, in a line each. Written into
 * the app (free, works offline). Famous appellations have their own lines; the rest use their
 * area's (see appellations.ts for which appellation belongs to which area).
 */

export interface RegionLines {
  knownFor: string;
  taste: string;
}

const AREAS: Record<string, RegionLines> = {
  Burgundy: { knownFor: 'Pinot Noir and Chardonnay from small, mapped vineyards.', taste: 'Red cherry and earth in the reds; citrus, stone and toast in the whites.' },
  Bordeaux: { knownFor: 'Cabernet and Merlot blends from grand châteaux.', taste: 'Blackcurrant, cedar and graphite, with firm tannin.' },
  'Southern Rhône': { knownFor: 'Grenache-led blends grown in sun and wind.', taste: 'Ripe red fruit, garrigue herbs and spice; warm and generous.' },
  'Northern Rhône': { knownFor: 'Syrah from steep granite slopes.', taste: 'Dark berries, black pepper, olive and smoked meat.' },
  Tuscany: { knownFor: 'Sangiovese, from Chianti to Brunello.', taste: 'Sour cherry, dried herbs and leather, with bright acidity.' },
  Piedmont: { knownFor: 'Nebbiolo, Barbera and Dolcetto in the Alpine foothills.', taste: 'Roses, tar and cherry, with firm tannin and acidity.' },
  Loire: { knownFor: 'Sauvignon Blanc, Chenin Blanc and Cabernet Franc.', taste: 'Crisp, mineral whites and light, leafy reds.' },
  Beaujolais: { knownFor: 'Gamay, from easy-drinking to the ten crus.', taste: 'Juicy red fruit, light and fresh.' },
  Veneto: { knownFor: 'Valpolicella, Amarone, Soave and Prosecco.', taste: 'Sour cherry and almond; richer when the grapes are dried.' },
  Sonoma: { knownFor: 'Pinot Noir, Chardonnay and old-vine Zinfandel.', taste: 'Ripe fruit, cooled by the fog off the Pacific.' },
  Napa: { knownFor: 'Cabernet Sauvignon.', taste: 'Ripe blackcurrant and plum, polished tannin and oak.' },
  'Central Coast': { knownFor: 'Pinot Noir, Chardonnay and Rhône grapes.', taste: 'Ripe and sunny, with ocean-cooled freshness.' },
  Oregon: { knownFor: 'Pinot Noir from the Willamette Valley.', taste: 'Red cherry and earth, between Burgundy and California.' },
  Rioja: { knownFor: 'Tempranillo, aged long in oak.', taste: 'Cherry, plum and leather, with vanilla and spice.' },
  'Ribera del Duero': { knownFor: 'Tempranillo grown high on the Duero.', taste: 'Darker and firmer than Rioja: black fruit and spice.' },
  'Castilla y León': { knownFor: 'Tempranillo and Verdejo on high plateaus.', taste: 'Bold, dark reds and zesty whites.' },
  Galicia: { knownFor: 'Albariño and Mencía in Spain’s green, rainy northwest.', taste: 'Saline, crisp whites and fresh, peppery reds.' },
  Catalonia: { knownFor: 'Priorat’s slate-grown reds and Cava.', taste: 'Dark, mineral and concentrated reds.' },
  Andalusia: { knownFor: 'Sherry.', taste: 'Dry and nutty to rich and sweet, from Fino to Pedro Ximénez.' },
  Douro: { knownFor: 'Port and dry reds from terraced schist slopes.', taste: 'Dark fruit, violets and firm structure.' },
  Minho: { knownFor: 'Vinho Verde.', taste: 'Light, crisp and zesty, sometimes with a little spritz.' },
  Champagne: { knownFor: 'Sparkling wine made by the traditional method.', taste: 'Citrus, apple and brioche, with fine bubbles.' },
  Alsace: { knownFor: 'Riesling, Gewürztraminer and Pinot Gris.', taste: 'Aromatic, full whites, from dry to sweet.' },
  Provence: { knownFor: 'Pale, dry rosé.', taste: 'Strawberry, citrus and herbs: light and crisp.' },
  Languedoc: { knownFor: 'Grenache, Syrah and Carignan blends.', taste: 'Sunny dark fruit and herbs, at fair prices.' },
  'South-West France': { knownFor: 'Malbec in Cahors and Tannat in Madiran.', taste: 'Dark, tannic and rustic.' },
  Sicily: { knownFor: 'Nero d’Avola, and Etna’s volcanic wines.', taste: 'From ripe and sunny to fresh and mineral on Etna.' },
  Mosel: { knownFor: 'Riesling from steep slate slopes.', taste: 'Light, racy and low in alcohol, often a little sweet.' },
  Rheingau: { knownFor: 'Riesling.', taste: 'Fuller than Mosel, with ripe fruit and firm acidity.' },
  Pfalz: { knownFor: 'Dry Riesling and Pinot Noir.', taste: 'Ripe and generous for Germany.' },
  Wachau: { knownFor: 'Grüner Veltliner and Riesling on the Danube.', taste: 'Precise and mineral, from light to rich.' },
  Mendoza: { knownFor: 'Malbec at high altitude.', taste: 'Plum, violet and blackberry: plush and dark.' },
  'South Australia': { knownFor: 'Shiraz from Barossa and McLaren Vale.', taste: 'Rich, ripe dark fruit and spice.' },
  Marlborough: { knownFor: 'Sauvignon Blanc.', taste: 'Passion fruit, citrus and cut grass: vivid and zesty.' },
  'Central Otago': { knownFor: 'Pinot Noir from the world’s southernmost vineyards.', taste: 'Bright cherry and spice.' },
};

const APPELLATIONS: Record<string, RegionLines> = {
  Barolo: { knownFor: 'Nebbiolo aged at least three years; “the king of wines”.', taste: 'Roses, tar and cherry, with firm tannin that softens with age.' },
  Barbaresco: { knownFor: 'Nebbiolo, a little more graceful than Barolo.', taste: 'Roses, red cherry and spice, with firm tannin.' },
  'Brunello di Montalcino': { knownFor: '100% Sangiovese, aged five years before release.', taste: 'Dark cherry, leather and earth: powerful and long.' },
  'Chianti Classico': { knownFor: 'Sangiovese from the hills between Florence and Siena.', taste: 'Sour cherry, violets and herbs, with bright acidity.' },
  'Châteauneuf-du-Pape': { knownFor: 'Grenache-led blends grown among large round stones.', taste: 'Ripe red fruit, herbs and spice: warm and generous.' },
  Chablis: { knownFor: 'Unoaked Chardonnay on chalky soil.', taste: 'Lemon, green apple and flint: lean and mineral.' },
  Sancerre: { knownFor: 'Sauvignon Blanc on chalk and flint.', taste: 'Citrus, gooseberry and a flinty edge.' },
  Priorat: { knownFor: 'Grenache and Carignan on black slate.', taste: 'Dark, concentrated and mineral.' },
};

export function regionLines(appellation: string | null, area: string): RegionLines | null {
  return (appellation ? APPELLATIONS[appellation] : undefined) ?? AREAS[area] ?? null;
}

/** A real photo of a region from Wikimedia Commons, kept with the app (public/regions/), and its credit. */
export interface RegionPhoto {
  /** Path under the app, e.g. "regions/barolo.jpg". */
  src: string;
  alt: string;
  /** "Photo: Name · CC BY-SA 4.0" */
  credit: string;
  /** The photo's page on Wikimedia Commons (author and licence). */
  page: string;
}

/** Checked by eye: each is the place it's named for. Regions without one show text only. */
const PHOTOS: Record<string, RegionPhoto> = {};

export function regionPhoto(appellation: string | null, area: string): RegionPhoto | null {
  return (appellation ? PHOTOS[appellation] : undefined) ?? PHOTOS[area] ?? null;
}
