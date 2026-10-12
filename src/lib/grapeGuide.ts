import { canonicalGrape } from './appellations';

/**
 * How each grape usually tastes and feels: body, tannin and acidity on a 1–5 scale, and one
 * sentence. Written into the app (free, works offline). These are a grape's typical traits, not
 * a measurement of one bottle; the wine page says so ("typical for …").
 */

export interface GrapeTraits {
  body: number;
  tannin: number;
  acidity: number;
  /** One sentence on how it tastes. */
  taste: string;
  red: boolean;
}

const r = (body: number, tannin: number, acidity: number, taste: string): GrapeTraits => ({ body, tannin, acidity, taste, red: true });
const w = (body: number, acidity: number, taste: string): GrapeTraits => ({ body, tannin: 1, acidity, taste, red: false });

const GRAPES: Record<string, GrapeTraits> = {
  Nebbiolo: r(4, 5, 5, 'Pale in the glass but powerful: roses, tar, cherry and firm tannin.'),
  Sangiovese: r(3, 4, 5, 'Sour cherry, dried herbs and earth, with bright acidity and dusty tannin.'),
  Tempranillo: r(4, 4, 3, 'Cherry, plum and leather, often with vanilla and spice from oak.'),
  Grenache: r(4, 2, 2, 'Ripe strawberry and raspberry: warm and generous, with soft tannin.'),
  Syrah: r(4, 4, 3, 'Dark berries, black pepper and smoked meat, with firm, savoury structure.'),
  Mourvèdre: r(5, 4, 3, 'Dark, meaty and earthy, with blackberry and firm tannin.'),
  Carignan: r(4, 3, 4, 'Dark fruit and spice, with rustic tannin and lively acidity.'),
  'Cabernet Sauvignon': r(5, 5, 4, 'Blackcurrant, cedar and graphite, with firm tannin built to age.'),
  Merlot: r(4, 3, 3, 'Plum and black cherry: round and supple, with softer tannin.'),
  'Cabernet Franc': r(3, 3, 4, 'Red berries and graphite with a leafy, peppery lift.'),
  'Pinot Noir': r(2, 2, 4, 'Red cherry, raspberry and earth: silky, light and fresh.'),
  Gamay: r(2, 2, 4, 'Bright, juicy red fruit with light tannin, made to taste fresh.'),
  Malbec: r(4, 4, 3, 'Plum, blackberry and violet: plush and dark.'),
  Zinfandel: r(5, 3, 3, 'Jammy bramble fruit and spice: ripe, warm and generous.'),
  'Petite Sirah': r(5, 5, 3, 'Inky blueberry and black pepper, with big, dense tannin.'),
  'Petit Verdot': r(5, 5, 4, 'Deep colour, violets and dark fruit, with powerful tannin.'),
  Carménère: r(4, 3, 3, 'Red plum, green pepper and spice: soft and round.'),
  Aglianico: r(5, 5, 5, 'Black cherry, smoke and earth, with fierce tannin and acidity.'),
  Montepulciano: r(4, 3, 3, 'Dark cherry and plum: soft, juicy and easy.'),
  'Nerello Mascalese': r(3, 4, 4, 'Red cherry, herbs and volcanic earth: Etna’s answer to Pinot and Nebbiolo.'),
  Mencía: r(3, 3, 4, 'Red fruit and flowers with a mineral, peppery edge.'),
  'Touriga Nacional': r(5, 4, 3, 'Dark fruit and violets: rich, structured, and the backbone of Port.'),
  Corvina: r(3, 2, 4, 'Sour cherry and almond: the grape behind Valpolicella and Amarone.'),
  Barbera: r(3, 2, 5, 'Juicy dark cherry with high acidity and little tannin.'),
  Cinsault: r(2, 2, 3, 'Light, fragrant red fruit with soft tannin.'),
  Graciano: r(4, 4, 4, 'Deep colour, dark fruit and spice; it adds structure to Rioja.'),
  Counoise: r(2, 2, 3, 'Peppery red fruit; a small part of Rhône blends.'),
  Chardonnay: w(4, 3, 'Apple and citrus when unoaked; butter, toast and vanilla with oak.'),
  'Sauvignon Blanc': w(2, 5, 'Zesty citrus, gooseberry and fresh-cut grass.'),
  Riesling: w(2, 5, 'Lime, green apple and a petrol note, with racy acidity; dry to sweet.'),
  Albariño: w(2, 5, 'Saline and crisp: lemon, peach and a sea-breeze freshness.'),
  'Chenin Blanc': w(3, 5, 'Quince, apple and honey, with high acidity; dry to sweet.'),
  Viognier: w(4, 2, 'Apricot, peach and honeysuckle: full and perfumed, with soft acidity.'),
  'Grüner Veltliner': w(3, 4, 'Citrus and green apple with a twist of white pepper.'),
  Gewürztraminer: w(4, 2, 'Lychee, rose and spice: full, perfumed and soft.'),
  'Pinot Gris': w(3, 3, 'Pear, apple and citrus: light as Grigio, richer in Alsace.'),
  'Pinot Blanc': w(3, 3, 'Gentle apple and almond: soft and clean.'),
  Sémillon: w(4, 3, 'Lemon, wax and honey: rich, and the heart of Sauternes.'),
  'Grenache Blanc': w(4, 2, 'Green apple and herbs: round and full.'),
  Viura: w(3, 3, 'Citrus and white flowers: the white grape of Rioja.'),
  Verdejo: w(3, 4, 'Citrus and fennel with a bitter-almond finish.'),
  'Melon de Bourgogne': w(2, 5, 'Lemon and green apple with a saline, mineral bite (Muscadet).'),
  Glera: w(2, 4, 'Pear, apple and white flowers: the grape of Prosecco.'),
  Cortese: w(2, 4, 'Lime and green almond, crisp and light (Gavi).'),
  Garganega: w(3, 4, 'Lemon, almond and pear (Soave).'),
  Palomino: w(2, 2, 'Neutral and bone-dry: the grape of Sherry.'),
  Assyrtiko: w(3, 5, 'Lemon, salt and flint, with piercing acidity (Santorini).'),
  Vermentino: w(3, 4, 'Lemon, herbs and a saline, bitter-almond finish.'),
  Godello: w(3, 4, 'Apple, citrus and stone, with a creamy texture.'),
  Marsanne: w(4, 2, 'Pear, almond and honey: rich and waxy.'),
  Roussanne: w(4, 3, 'Pear, herbs and honey: rich, with a fresh edge.'),
};

const FOLD = new Map(Object.keys(GRAPES).map((k) => [k.toLowerCase(), k]));

/** The guide's name for a grape ("Shiraz" → "Syrah"), or null when the guide doesn't know it. */
export function guideName(grape: string): string | null {
  const c = canonicalGrape(grape);
  return FOLD.get(c.toLowerCase()) ?? null;
}

export function grapeTraits(grape: string): GrapeTraits | null {
  const n = guideName(grape);
  return n ? GRAPES[n] : null;
}
