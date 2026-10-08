import type { Wine } from '../types';
import { producerAndName } from './format';
import { fold } from './text';

/**
 * "Tonight": which bottle at home to open with what you're cooking. Free and on the
 * device: a small table from grape, style and colour to dishes, plus your ratings.
 */

export type Dish = 'pasta' | 'steak' | 'chicken' | 'fish' | 'pizza' | 'spicy' | 'cheese' | 'glass';

export const DISHES: { id: Dish; label: string }[] = [
  { id: 'pasta', label: 'Pasta' },
  { id: 'steak', label: 'Steak' },
  { id: 'chicken', label: 'Chicken' },
  { id: 'fish', label: 'Fish' },
  { id: 'pizza', label: 'Pizza' },
  { id: 'spicy', label: 'Spicy' },
  { id: 'cheese', label: 'Cheese' },
  { id: 'glass', label: 'Just a glass' },
];

interface Rule {
  /** Matched as whole words against the wine's grapes, name and region. */
  words: string[];
  /** Fit from 0 (no) to 3 (classic). */
  fit: Partial<Record<Dish, number>>;
  /** Opening of the reason line for a dish. */
  why: Partial<Record<Dish, string>>;
  /** Big reds that want air or a weekend. */
  big?: boolean;
  /** Only for wines of this colour (a white Bordeaux is not a steak wine). */
  red?: boolean;
}

const RULES: Rule[] = [
  {
    red: true,
    words: ['nebbiolo', 'barolo', 'barbaresco', 'langhe', 'gattinara'],
    fit: { pasta: 3, steak: 2, cheese: 2, pizza: 1 },
    why: { pasta: 'Firm enough for a ragù', steak: 'Grippy enough for a steak', cheese: 'Made for a hard cheese', pizza: 'Sturdy enough for pizza' },
    big: true,
  },
  {
    red: true,
    words: ['sangiovese', 'chianti', 'brunello', 'montalcino', 'montepulciano', 'aglianico', 'barbera', 'dolcetto', 'nero d avola', 'valpolicella'],
    fit: { pasta: 3, pizza: 2, cheese: 2, steak: 1 },
    why: { pasta: 'Bright and savoury, just right with tomato', pizza: 'Bright enough to cut through the cheese', cheese: 'Good with something salty and aged', steak: 'Savoury enough for red meat' },
  },
  {
    red: true,
    words: ['cabernet', 'pauillac', 'margaux', 'saint julien', 'st julien', 'bordeaux'],
    fit: { steak: 3, cheese: 2, pasta: 1 },
    why: { steak: 'Built for a steak', cheese: 'Firm enough for an aged cheese', pasta: 'Firm enough for a meat sauce' },
    big: true,
  },
  {
    red: true,
    words: ['syrah', 'shiraz', 'hermitage', 'cote rotie', 'cornas', 'chateauneuf', 'gigondas', 'vacqueyras', 'mourvedre', 'bandol', 'gsm'],
    fit: { steak: 3, cheese: 2, pizza: 1 },
    why: { steak: 'Warm, dark fruit for a steak', cheese: 'Rich enough for a strong cheese', pizza: 'Warm fruit for a meaty pizza' },
    big: true,
  },
  {
    red: true,
    words: ['grenache', 'garnacha', 'cotes du rhone', 'priorat', 'malbec', 'tempranillo', 'rioja', 'ribera'],
    fit: { steak: 3, pizza: 2, cheese: 1, pasta: 1 },
    why: { steak: 'Warm fruit, soft enough for a weeknight steak', pizza: 'An easy red for pizza', cheese: 'Soft enough for most cheeses', pasta: 'Juicy enough for a meat sauce' },
  },
  {
    red: true,
    words: ['merlot', 'zinfandel', 'primitivo', 'carmenere', 'red blend', 'lambrusco'],
    fit: { pizza: 3, steak: 2, pasta: 2 },
    why: { pizza: 'An easy red for pizza night', steak: 'Round enough for a burger or steak', pasta: 'Soft and fruity with a red sauce' },
  },
  {
    red: true,
    words: ['pinot noir', 'bourgogne', 'burgundy', 'gamay', 'beaujolais', 'morgon', 'fleurie', 'cru beaujolais', 'spatburgunder', 'frappato'],
    fit: { chicken: 3, fish: 1, pasta: 1, pizza: 1, glass: 2 },
    why: { chicken: 'Light, juicy, and it won’t overpower a roast bird', fish: 'Light enough for salmon', pasta: 'Light enough for a mushroom pasta', pizza: 'Juicy and light for pizza', glass: 'Light and easy on its own' },
  },
  {
    words: ['chardonnay', 'chablis', 'meursault', 'puligny', 'chassagne', 'pouilly fuisse', 'macon', 'white burgundy'],
    fit: { chicken: 3, fish: 2, pasta: 1, cheese: 1 },
    why: { chicken: 'Rich enough for a roast chicken', fish: 'Round enough for a buttery fish', pasta: 'Rich enough for a cream sauce', cheese: 'Good with a soft cheese' },
  },
  {
    words: ['sauvignon blanc', 'sancerre', 'pouilly fume', 'albarino', 'vermentino', 'muscadet', 'pinot grigio', 'pinot gris', 'gruner', 'assyrtiko', 'picpoul', 'verdejo', 'vinho verde'],
    fit: { fish: 3, chicken: 2, glass: 2, spicy: 1, cheese: 1 },
    why: { fish: 'Crisp and bright, lovely with fish', chicken: 'Fresh enough for a lighter chicken', glass: 'Crisp and easy on its own', spicy: 'Zesty enough for a little heat', cheese: 'Bright with a goat cheese' },
  },
  {
    words: ['riesling', 'gewurztraminer', 'chenin', 'vouvray', 'viognier', 'torrontes', 'moscato', 'off dry', 'kabinett', 'spatlese'],
    fit: { spicy: 3, fish: 2, chicken: 2, glass: 1, cheese: 1 },
    why: { spicy: 'A touch of sweetness to cool the heat', fish: 'Aromatic enough for a fragrant fish', chicken: 'Bright with a spiced chicken', glass: 'Fragrant and easy on its own', cheese: 'Lovely with a washed-rind cheese' },
  },
];

/** Fallbacks by colour when no grape or region matches. */
const BY_STYLE: Record<NonNullable<Wine['style']>, Rule> = {
  red: { words: [], fit: { steak: 1, pasta: 1, pizza: 1, cheese: 1 }, why: { steak: 'A red for red meat', pasta: 'A red for a meaty pasta', pizza: 'A red for pizza', cheese: 'A red for the cheese board' } },
  white: { words: [], fit: { fish: 2, chicken: 2, glass: 1 }, why: { fish: 'A white for fish', chicken: 'A white for chicken', glass: 'An easy white on its own' } },
  rose: { words: [], fit: { fish: 3, spicy: 2, chicken: 1, glass: 3, pizza: 1 }, why: { fish: 'Fresh and pink, lovely with fish', spicy: 'Cool and fruity against the heat', chicken: 'Fresh enough for a lighter chicken', glass: 'Pink, fresh and easy on its own', pizza: 'Fresh and fruity for pizza' } },
  sparkling: { words: [], fit: { fish: 3, glass: 3, spicy: 1, cheese: 1, chicken: 1 }, why: { fish: 'The bright bottle you own. Lovely with fish', glass: 'Bubbles need no reason', spicy: 'Bubbles cool the heat', cheese: 'Bubbles cut through a rich cheese', chicken: 'Bubbles with fried chicken' } },
  orange: { words: [], fit: { spicy: 2, cheese: 2, chicken: 1, fish: 1 }, why: { spicy: 'Grippy and aromatic against the spice', cheese: 'Savoury enough for a strong cheese', chicken: 'Textured enough for chicken', fish: 'Savoury with a richer fish' } },
  dessert: { words: [], fit: { cheese: 3, spicy: 1 }, why: { cheese: 'Sweet and rich with a blue cheese', spicy: 'Sweet enough to cool the heat' } },
  fortified: { words: [], fit: { cheese: 3, glass: 1 }, why: { cheese: 'Classic with a hard or blue cheese', glass: 'A small glass after dinner' } },
};

const words = (w: Wine) => ` ${fold([...w.grapes, w.name, w.region, w.producer].join(' ')).replace(/[^a-z0-9]+/g, ' ')} `;

/** The rules that describe this wine: matching grapes or regions, and its colour. */
function rulesFor(w: Wine): Rule[] {
  const text = words(w);
  const red = w.style === 'red' || (!w.style && RULES.some((r) => r.red && r.words.some((x) => text.includes(` ${x} `))));
  const hits = RULES.filter((r) => Boolean(r.red) === red && r.words.some((x) => text.includes(` ${x} `)));
  // The colour's own rule too: a Champagne is a Chardonnay and still bubbles.
  return w.style ? [...hits, BY_STYLE[w.style]] : hits;
}

/** 0–3: how well this wine goes with the dish, and the reason opening for it. */
export function dishFit(w: Wine, dish: Dish): { fit: number; why: string } {
  let best = { fit: 0, why: '' };
  for (const r of rulesFor(w)) {
    const fit = r.fit[dish] ?? 0;
    if (fit > best.fit) best = { fit, why: r.why[dish] ?? '' };
  }
  // A crisp white, rosé or sparkling also suits "just a glass" when nothing says otherwise.
  if (dish === 'glass' && best.fit === 0 && (w.style === 'white' || w.style === 'rose' || w.style === 'sparkling')) {
    best = { fit: 1, why: 'Gentle on its own, and it’s ready now' };
  }
  return best;
}

export const isBigRed = (w: Wine) => w.style === 'red' && rulesFor(w).some((r) => r.big);

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface TonightPick {
  wine: Wine;
  score: number;
  fit: number;
  reason: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Firm enough for a ragù, and you loved it in March." */
export function reasonFor(w: Wine, dish: Dish, now = new Date()): string {
  const { fit, why } = dishFit(w, dish);
  const opening = fit > 0 ? why : 'Not a classic match, but it’s what you have at home';
  const d = w.tastedOn ? new Date(`${w.tastedOn}T12:00:00`) : null;
  const when = d && !Number.isNaN(d.getTime()) ? (d.getFullYear() === now.getFullYear() ? ` in ${MONTHS[d.getMonth()]}` : ` in ${d.getFullYear()}`) : '';
  // Never two "and"s in one sentence.
  const tail = (verb: string) => (opening.includes(', and ') ? `${opening}. You ${verb} it${when}.` : `${opening}, and you ${verb} it${when}.`);
  if (w.rating === 'loved') return tail('loved');
  if (w.rating === 'liked') return dish === 'glass' && fit > 0 ? `An easy one you liked. Save the good stuff.` : tail('liked');
  return `${opening}.`;
}

/** Bottles at home ranked for this dish: dish fit + Loved 2 / Liked 1, a little less for the pricier ones. */
export function rankTonight(wines: Wine[], dish: Dish, now = new Date()): TonightPick[] {
  const candidates = wines.filter((w) => !w.list && w.owned > 0 && w.rating !== 'wouldnt');
  const mid = median(wines.filter((w) => !w.list && w.price !== null).map((w) => w.price!));
  const scored = candidates.map((w) => {
    const { fit } = dishFit(w, dish);
    const bonus = w.rating === 'loved' ? 2 : w.rating === 'liked' ? 1 : 0;
    // Just a glass: keep the good bottles for later.
    const penalty = mid !== null && w.price !== null && w.price > mid ? (dish === 'glass' ? 1.5 : 0.5) : 0;
    return { wine: w, fit, score: fit + bonus - penalty, reason: reasonFor(w, dish, now) };
  });
  return scored.sort((a, b) => b.score - a.score || b.fit - a.fit || b.wine.owned - a.wine.owned || a.wine.id.localeCompare(b.wine.id));
}

/** "Another": the next one down, back to the first after the last. */
export const nextIndex = (i: number, n: number) => (n ? (i + 1) % n : 0);

const RATING_RANK = { loved: 2, liked: 1, wouldnt: -1 } as const;
const rank = (w: Wine) => (w.rating ? RATING_RANK[w.rating] : 0);
const DISH_NOUN: Record<Dish, string> = {
  pasta: 'a long Sunday lunch',
  steak: 'Saturday’s steak',
  chicken: 'Saturday’s roast',
  fish: 'a weekend fish supper',
  pizza: 'a weekend pizza',
  spicy: 'a weekend curry',
  cheese: 'a weekend cheese board',
  glass: 'a weekend dinner',
};

/** A wine named in a sentence, producer included: "your Château Essai Grand Vin". */
function shortName(w: Wine): string {
  return producerAndName(w);
}

/**
 * "Save for a weekend": another bottle at home that suits the dish better but is the
 * pricier one you rated higher, or a big red that needs time open. One sentence, or null.
 */
export function saveForWeekend(ranked: TonightPick[], pick: TonightPick, dish: Dish): { wine: Wine; text: string } | null {
  const others = ranked.filter((p) => p.wine.id !== pick.wine.id);
  const better = others.find(
    (p) => p.fit > pick.fit && rank(p.wine) >= rank(pick.wine) && (p.wine.price ?? 0) > (pick.wine.price ?? Infinity),
  );
  if (better) {
    return { wine: better.wine, text: `Your ${shortName(better.wine)} is an even better match, but it’s the special one. Keep it for ${DISH_NOUN[dish]}.` };
  }
  const big = others.find((p) => p.fit >= 2 && isBigRed(p.wine) && rank(p.wine) >= rank(pick.wine));
  if (big) {
    return { wine: big.wine, text: `Your ${shortName(big.wine)} needs a couple of hours open. It would suit ${DISH_NOUN[dish]} better.` };
  }
  return null;
}
