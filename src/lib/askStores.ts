import type { StoreId, StoreItem, SuggestedItem } from './stores';
import { fold, tokens } from './text';

/**
 * The chat's view of the stores: the bottles saved on this phone (Pogo's downloaded wine list, a
 * Total Wine store's imported stock), searched here for each question so Claude only gets the few
 * dozen that match, never the whole list. Claude names bottles by id; the rows shown under the
 * answer are drawn from this data, not from Claude's text.
 */

export interface StoreStock {
  store: StoreId;
  /** "Pogo’s", or "Total Wine (Las Colinas)". */
  name: string;
  /** When the list was downloaded or imported. */
  at: number;
  bottles: (StoreItem | SuggestedItem)[];
}

/** A matching bottle, with the short id Claude refers to it by. */
export interface StoreHit {
  id: string;
  stock: StoreStock;
  item: StoreItem | SuggestedItem;
}

/** What the chat shows for a store bottle named in an answer. */
export interface ShopRow {
  store: StoreId;
  storeName: string;
  title: string;
  price: number | null;
  url: string;
  image: string | null;
  deal?: string;
  score?: string;
}

// Words in a question that say nothing about which bottles it means.
const NOISE = new Set(
  tokens(
    'a an the and or of for to in on at with without is are do does did have has had any there their i me my we you what which who how about tell show find list recommend suggest give get buy under over below above max up less than more cheap cheaper good great best nice some something anything wine wines bottle bottles store stores shop pogo pogos total totalwine they can could would should please tonight today now like want need looking look try next from near by made between into',
  ),
);

const STYLE_WORDS: Record<string, string> = { red: 'red', reds: 'red', white: 'white', whites: 'white', rose: 'rose', sparkling: 'sparkling', orange: 'orange', dessert: 'dessert' };

/** "French" and "France" are the same country: a bottle from another one is out, not just ranked lower. */
const COUNTRY: Record<string, string> = {
  french: 'france',
  france: 'france',
  italian: 'italy',
  italy: 'italy',
  spanish: 'spain',
  spain: 'spain',
  portuguese: 'portugal',
  portugal: 'portugal',
  german: 'germany',
  germany: 'germany',
  austrian: 'austria',
  austria: 'austria',
  chilean: 'chile',
  chile: 'chile',
  argentinian: 'argentina',
  argentine: 'argentina',
  argentina: 'argentina',
  australian: 'australia',
  australia: 'australia',
  zealand: 'zealand',
  african: 'africa',
  africa: 'africa',
  greek: 'greece',
  greece: 'greece',
};

/**
 * A grape or style is often not in a bottle's name: red Burgundy is Pinot Noir, Barolo is Nebbiolo.
 * Asking for the grape also finds the places that make it (all in one spelling, as `tokens` gives them).
 */
const PLACES: Record<string, string[]> = {
  pinot: ['burgundy', 'bourgogne', 'mercurey', 'gevrey', 'chambertin', 'chambolle', 'musigny', 'vosne', 'romanee', 'nuits', 'morey', 'fixin', 'marsannay', 'volnay', 'pommard', 'beaune', 'savigny', 'aloxe', 'corton', 'santenay', 'givry', 'rully', 'chalonnaise', 'nuit', 'willamette'],
  nebbiolo: ['barolo', 'barbaresco', 'langhe', 'roero', 'gattinara', 'ghemme', 'valtellina', 'piedmont', 'piemonte'],
  sangiovese: ['chianti', 'brunello', 'montalcino', 'montepulciano', 'nobile', 'tuscany', 'toscana', 'morellino'],
  tempranillo: ['rioja', 'ribera', 'duero', 'toro', 'crianza'],
  garnacha: ['priorat', 'borja', 'calatayud'],
  grenache: ['chateauneuf', 'gigondas', 'vacqueyras', 'rhone', 'priorat', 'garnacha'],
  syrah: ['hermitage', 'crozes', 'rotie', 'cornas', 'joseph', 'rhone', 'shiraz'],
  cabernet: ['bordeaux', 'medoc', 'pauillac', 'margaux', 'julien', 'estephe', 'napa', 'graves'],
  merlot: ['bordeaux', 'pomerol', 'emilion', 'napa'],
  chardonnay: ['chablis', 'meursault', 'montrachet', 'pouilly', 'fuisse', 'macon', 'puligny', 'chassagne', 'burgundy', 'bourgogne', 'sonoma'],
  sauvignon: ['sancerre', 'pouilly', 'fume', 'marlborough', 'pessac'],
  riesling: ['mosel', 'rheingau', 'kabinett', 'spatlese', 'alsace', 'pfalz'],
  malbec: ['mendoza', 'cahors', 'uco'],
  burgundy: ['bourgogne', 'pinot', 'chardonnay'],
  bordeaux: ['medoc', 'pauillac', 'margaux', 'pomerol', 'emilion', 'graves', 'pessac'],
};

/** The most per bottle a question asks for ("under $40", "below 25"), or null. */
export function priceCap(question: string): number | null {
  const m = /(?:under|below|less than|up to|max(?:imum)?|<|≤)\s*\$?\s*(\d{2,4})/i.exec(question) ?? /\$\s*(\d{2,4})/.exec(question);
  return m ? Number(m[1]) : null;
}

const stem = (t: string) => (t.length > 4 ? t.replace(/(es|s)$/, '') : t);

const criticPoints = (b: StoreItem | SuggestedItem) => {
  const s = 'score' in b ? b.score : '';
  const m = s ? /(\d{2,3})\s*pts/.exec(s) : null;
  return m ? Number(m[1]) : 0;
};

/**
 * The bottles most likely meant by a question (and, for a follow-up, the one before it), from every
 * saved store list: matched on name, region, country, grapes and colour, within any price asked for.
 * A country in the question ("French", "Italy") keeps out every other country; a grape also finds
 * the places that make it. A question with nothing to match on ("what should I try?") gets the
 * best-reviewed bottles instead. `total` is how many bottles matched, of which the best `n` are returned.
 */
export function searchStock(question: string, previous: string[], stocks: StoreStock[], n = 40): { hits: StoreHit[]; total: number } {
  const words = (q: string) => tokens(q).filter((t) => !NOISE.has(t) && !/^\d+$/.test(t));
  const style = tokens(question).map((t) => STYLE_WORDS[t]).find(Boolean) ?? null;
  const asked = words(question).filter((t) => !STYLE_WORDS[t]);
  const countries = new Set(asked.flatMap((t) => (COUNTRY[t] ? [COUNTRY[t]] : [])));
  const own = new Set(asked.filter((t) => !COUNTRY[t]).map(stem));
  const before = new Set(words(previous.at(-1) ?? '').filter((t) => !STYLE_WORDS[t] && !COUNTRY[t]).map(stem));
  // Places that make a grape that was asked for (also from a country-less follow-up's earlier question).
  const places = new Set([...own].flatMap((t) => PLACES[t] ?? []).map(stem));
  const cap = priceCap(question);

  const hits: { stock: StoreStock; item: StoreItem | SuggestedItem; score: number }[] = [];
  for (const stock of stocks) {
    for (const item of stock.bottles) {
      if (item.sizeMl !== null && item.sizeMl !== 750) continue;
      if (style && item.style !== style) continue;
      if (cap !== null && (item.price === null || item.price > cap)) continue;
      const origin = new Set(tokens(`${item.country} ${item.context ?? ''}`));
      if (countries.size && ![...countries].some((c) => origin.has(c))) continue;
      const hay = new Set(tokens([item.title, item.context ?? '', item.country, 'region' in item ? item.region : '', 'grapes' in item ? item.grapes.join(' ') : '', 'program' in item ? (item.program ?? '') : ''].join(' ')).map(stem));
      let score = 0;
      for (const t of own) if (hay.has(t)) score += 10;
      for (const t of places) if (hay.has(t)) score += 8;
      for (const t of before) if (!own.has(t) && hay.has(t)) score += 4;
      if (score === 0 && (own.size > 0 || (before.size > 0 && !style && countries.size === 0))) continue;
      hits.push({ stock, item, score: score + criticPoints(item) / 100 });
    }
  }
  hits.sort((a, b) => b.score - a.score);

  // Both stores get a fair share of the room.
  const per = Math.max(Math.ceil(n / Math.max(1, stocks.length)), 10);
  const taken = new Map<StoreId, number>();
  const out: StoreHit[] = [];
  for (const h of hits) {
    if (out.length >= n) break;
    const k = taken.get(h.stock.store) ?? 0;
    if (k >= per) continue;
    taken.set(h.stock.store, k + 1);
    out.push({ id: `S${out.length + 1}`, stock: h.stock, item: h.item });
  }
  return { hits: out, total: hits.length };
}

const day = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** What goes to Claude with the question: which lists exist, and the matching bottles, one line each. */
export function stockBlock(stocks: StoreStock[], hits: StoreHit[], total = hits.length): string {
  if (!stocks.length) {
    return 'Store bottles: none. No Pogo’s or Total Wine list is saved on my phone, so you cannot see what any store has. If I ask about a store’s bottles, say so and suggest loading the list on the In store screen.';
  }
  const lists = stocks.map((s) => `${s.name} (${s.bottles.length} bottles, as of ${day(s.at)})`).join('; ');
  if (!hits.length) return `Store bottles: lists saved on my phone: ${lists}. None of their bottles matched this question.`;
  const lines = hits.map(({ id, stock, item }) => {
    const detail = 'grapes' in item ? [item.region || item.country, item.grapes.join(', ')] : [item.country];
    return [
      id,
      stock.name,
      item.title,
      item.style ?? '',
      detail.filter(Boolean).join(', '),
      item.price !== null ? `$${item.price.toFixed(2)}` : 'price not shown',
      'program' in item ? item.program : '',
      'deal' in item ? item.deal : '',
      'score' in item ? item.score : '',
      'aisle' in item && item.aisle ? item.aisle : '',
    ]
      .filter(Boolean)
      .join(' | ');
  });
  const shown = total > hits.length ? `the best ${hits.length} of ${total} matching bottles` : `all ${hits.length} matching bottles`;
  return `Store bottles from lists saved on my phone: ${lists}. Here are ${shown}, best first, picked by a simple word search, so a bottle whose name doesn't show its grape or place may be missing. Never say these are the only ones the store has. "Winery Direct" and "Premium Selection" mark Total Wine's own imports: deals such as "20% off a mix of 9+ Winery Direct wines" only count those bottles, so when I ask about such a deal, choose only bottles marked with it (id | store | bottle | colour | place | price | programme | deal | critic score | aisle):\n${lines.join('\n')}`;
}

/** The rows under an answer: only ids that were really sent, in the answer's order, without repeats. */
export function shopRows(ids: string[], hits: StoreHit[]): ShopRow[] {
  const byId = new Map(hits.map((h) => [h.id.toLowerCase(), h]));
  const seen = new Set<string>();
  const rows: ShopRow[] = [];
  for (const raw of ids) {
    const id = fold(raw);
    const h = byId.get(id);
    if (!h || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      store: h.stock.store,
      storeName: h.stock.name,
      title: h.item.title,
      price: h.item.price,
      url: h.item.url,
      image: h.item.image,
      deal: 'deal' in h.item && h.item.deal ? h.item.deal : undefined,
      score: 'score' in h.item && h.item.score ? h.item.score : undefined,
    });
  }
  return rows;
}
