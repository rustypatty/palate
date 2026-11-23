import type { Wine, WineStyle } from '../types';
import { currentWindow, windowStatus } from './drinkWindow';
import { wineFacts } from './insights';

/**
 * The Insights dashboard, computed from your own wines.
 *
 * One pure function turns the collection into every number the page shows. Nothing is stored:
 * as wines are added, rated, priced and dated, the numbers move. Each card has a minimum
 * amount of evidence (MIN) and the page shows it only once the data can support it.
 */

/** How much data each card needs before it says anything. */
export const MIN = {
  /** Rated wines of a grape before it gets a row in the grape table. */
  grapeRated: 5,
  /** Tastings (with a date) before the weekday chart shows. */
  weekdayTastings: 10,
  /** Rated wines that also have a price before the price chart shows. */
  priceRated: 8,
  /** Rated wines in one price band before the band is drawn. */
  band: 5,
  /** Rated wines before a country is listed at all. */
  countryRated: 3,
  /** Under this many rated wines, a country or band is called an early read. */
  smallSample: 8,
  /** Weeks of activity before the weekly chart shows. */
  weeks: 2,
  /** Rated wines before a written highlight is made from them. */
  highlightRated: 10,
} as const;

export type RangeId = '8w' | '30d' | 'all';

export const RANGES: { id: RangeId; label: string }[] = [
  { id: '8w', label: 'Last 8 weeks' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
];

export interface DashboardFilter {
  range: RangeId;
  style: WineStyle | 'all';
  /** A country as written on the wines, or 'all'. */
  country: string;
}

export const ALL_TIME_MAX_WEEKS = 26;

export interface WeekPoint {
  /** Monday of the week, yyyy-mm-dd. */
  start: string;
  /** "Nov 9". */
  label: string;
  added: number;
  tasted: number;
  /** The week is still going (it holds today). */
  partial: boolean;
}

export interface RateRow {
  key: string;
  label: string;
  /** Wines in the group. */
  wines: number;
  /** Of those, rated. */
  rated: number;
  loved: number;
  /** loved / rated, 0–1. */
  rate: number;
}

/** A sentence with some words in bold: [text, bold?]. */
export type Segment = { t: string; b?: boolean };
export interface Highlight {
  id: 'country' | 'weekday' | 'price' | 'grape';
  parts: Segment[];
}

export interface Dashboard {
  filter: DashboardFilter;
  /** Wines the numbers are drawn from (after the filters). */
  count: number;
  kpis: {
    wines: number;
    tasted: number;
    rated: number;
    loved: number;
    /** loved / rated, 0–1; null with nothing rated. */
    lovedRate: number | null;
    bottles: number;
    priced: number;
    medianPaid: number | null;
  };
  /** Oldest first. Empty until there are MIN.weeks weeks to draw. */
  weeks: WeekPoint[];
  /** Last full week against the one before: a change as a fraction (−0.57 = down 57%), null without a baseline. */
  change: { added: number | null; tasted: number | null; addedLast: number; tastedLast: number };
  /** One week that holds a big share of all tastings. */
  peak: { label: string; tasted: number; share: number } | null;
  /** Tastings Monday…Sunday; null until MIN.weekdayTastings tastings are dated. */
  weekdays: { counts: number[]; total: number; top: number } | null;
  grapes: RateRow[];
  /** Grapes with ratings that are still under MIN.grapeRated. */
  grapesPending: number;
  /** The most wines rated of any one grape (how close the table is to starting). */
  grapeMostRated: number;
  countries: RateRow[];
  prices: RateRow[];
  /** Rated wines that also have a price. */
  pricedRated: number;
  drink: { onHand: number; ready: number; soon: number; early: number; past: number; none: number };
  coverage: { id: 'rating' | 'tasted' | 'price'; label: string; have: number; total: number }[];
  highlights: Highlight[];
}

export const EMPTY_FILTER: DashboardFilter = { range: '8w', style: 'all', country: 'all' };

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEK_MS = 7 * 24 * 3600 * 1000;

export const PRICE_STEPS: { id: string; label: string; min: number; max: number }[] = [
  { id: 'u25', label: 'Under $25', min: 0, max: 25 },
  { id: '25-50', label: '$25–50', min: 25, max: 50 },
  { id: '50-100', label: '$50–100', min: 50, max: 100 },
  { id: '100+', label: '$100+', min: 100, max: Infinity },
];

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Midnight on the Monday that starts the week holding `d`. */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function parseIso(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

const tastedDate = (w: Wine) => parseIso(w.tastedOn);
const addedDate = (w: Wine) => new Date(w.createdAt);
/** When a wine last mattered: the day you tasted it, else the day you added it. */
const activityDate = (w: Wine) => tastedDate(w) ?? addedDate(w);

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const weekLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function rateRow(key: string, label: string, ws: Wine[]): RateRow {
  const rated = ws.filter((w) => w.rating !== null);
  const loved = rated.filter((w) => w.rating === 'loved').length;
  return { key, label, wines: ws.length, rated: rated.length, loved, rate: rated.length ? loved / rated.length : 0 };
}

/** Highest rate first; more rated wines break a tie. */
const byRate = (a: RateRow, b: RateRow) => b.rate - a.rate || b.rated - a.rated || a.label.localeCompare(b.label);

/** Countries that appear on your wines, most wines first: the choices for the Country filter. */
export function countryOptions(wines: Wine[]): string[] {
  const n = new Map<string, number>();
  for (const w of wines) {
    const c = w.country.trim();
    if (c) n.set(c, (n.get(c) ?? 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

export function buildDashboard(collection: Wine[], filter: DashboardFilter = EMPTY_FILTER, now = new Date()): Dashboard {
  const scoped = collection.filter(
    (w) => (filter.style === 'all' || w.style === filter.style) && (filter.country === 'all' || w.country.trim() === filter.country),
  );

  // --- Weeks: the most recent ones, ending with the last full week (or this one, once it has activity).
  const thisWeek = weekStart(now);
  const thisWeekHasActivity = scoped.some(
    (w) => weekStart(addedDate(w)).getTime() === thisWeek.getTime() || (tastedDate(w) && weekStart(tastedDate(w)!).getTime() === thisWeek.getTime()),
  );
  const lastWeek = new Date(thisWeek);
  if (!thisWeekHasActivity) lastWeek.setDate(lastWeek.getDate() - 7);
  let nWeeks = filter.range === '8w' ? 8 : 5;
  if (filter.range === 'all') {
    const first = scoped.reduce<number | null>((m, w) => {
      const t = weekStart(activityDate(w)).getTime();
      return m === null || t < m ? t : m;
    }, null);
    nWeeks = first === null ? 0 : Math.min(ALL_TIME_MAX_WEEKS, Math.max(1, Math.round((lastWeek.getTime() - first) / WEEK_MS) + 1));
  }
  const starts: Date[] = [];
  for (let i = nWeeks - 1; i >= 0; i--) {
    const d = new Date(lastWeek);
    d.setDate(d.getDate() - 7 * i);
    starts.push(d);
  }
  const firstStart = starts[0] ?? lastWeek;

  // --- The wines the cards are drawn from: inside the range.
  const inRange = filter.range === 'all' ? scoped : scoped.filter((w) => activityDate(w) >= firstStart);

  const index = new Map(starts.map((d, i) => [isoOf(d), i]));
  const weeks: WeekPoint[] = starts.map((d) => ({ start: isoOf(d), label: weekLabel(d), added: 0, tasted: 0, partial: d.getTime() === thisWeek.getTime() }));
  for (const w of scoped) {
    const a = index.get(isoOf(weekStart(addedDate(w))));
    if (a !== undefined) weeks[a].added++;
    const t = tastedDate(w);
    const ti = t ? index.get(isoOf(weekStart(t))) : undefined;
    if (ti !== undefined) weeks[ti].tasted++;
  }

  const full = weeks.filter((w) => !w.partial);
  const last = full[full.length - 1];
  const prior = full[full.length - 2];
  const delta = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined || b === 0 ? null : (a - b) / b);
  const change = {
    added: delta(last?.added, prior?.added),
    tasted: delta(last?.tasted, prior?.tasted),
    addedLast: last?.added ?? 0,
    tastedLast: last?.tasted ?? 0,
  };

  const tastedTotal = weeks.reduce((s, w) => s + w.tasted, 0);
  const peakWeek = weeks.reduce<WeekPoint | null>((m, w) => (m === null || w.tasted > m.tasted ? w : m), null);
  const peak =
    peakWeek && weeks.length >= 3 && tastedTotal >= 20 && peakWeek.tasted / tastedTotal >= 0.25
      ? { label: peakWeek.label, tasted: peakWeek.tasted, share: peakWeek.tasted / tastedTotal }
      : null;

  // --- Headline numbers.
  const rated = inRange.filter((w) => w.rating !== null);
  const loved = rated.filter((w) => w.rating === 'loved').length;
  const priced = inRange.filter((w) => w.price !== null);
  const kpis = {
    wines: inRange.length,
    tasted: inRange.filter((w) => w.tastedOn).length,
    rated: rated.length,
    loved,
    lovedRate: rated.length ? loved / rated.length : null,
    bottles: inRange.reduce((s, w) => s + Math.max(0, w.owned), 0),
    priced: priced.length,
    medianPaid: median(priced.map((w) => w.price!)),
  };

  // --- Tastings by weekday.
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const w of inRange) {
    const t = tastedDate(w);
    if (t) dayCounts[(t.getDay() + 6) % 7]++;
  }
  const dayTotal = dayCounts.reduce((s, n) => s + n, 0);
  const weekdays = dayTotal >= MIN.weekdayTastings ? { counts: dayCounts, total: dayTotal, top: dayCounts.indexOf(Math.max(...dayCounts)) } : null;

  // --- Loved rate by grape, country and price.
  const byGrape = new Map<string, Wine[]>();
  for (const w of inRange) for (const g of new Set(wineFacts(w).grapes)) byGrape.set(g, [...(byGrape.get(g) ?? []), w]);
  const grapeRows = [...byGrape].map(([g, ws]) => rateRow(g, g, ws));
  const grapes = grapeRows.filter((r) => r.rated >= MIN.grapeRated).sort(byRate);
  const grapesPending = grapeRows.filter((r) => r.rated > 0 && r.rated < MIN.grapeRated).length;
  const grapeMostRated = Math.max(0, ...grapeRows.map((r) => r.rated));

  const byCountry = new Map<string, Wine[]>();
  for (const w of inRange) {
    const c = w.country.trim();
    if (c) byCountry.set(c, [...(byCountry.get(c) ?? []), w]);
  }
  // Countries with plenty of ratings come first; a country with a handful is an early read, listed after.
  const countries = [...byCountry]
    .map(([c, ws]) => rateRow(c, c, ws))
    .filter((r) => r.rated >= MIN.countryRated)
    .sort((a, b) => Number(b.rated >= MIN.smallSample) - Number(a.rated >= MIN.smallSample) || byRate(a, b));

  const pricedRatedWines = rated.filter((w) => w.price !== null);
  const prices = PRICE_STEPS.map((s) => rateRow(s.id, s.label, pricedRatedWines.filter((w) => w.price! >= s.min && w.price! < s.max)));

  // --- Bottles on hand against their drink windows.
  const drink = { onHand: 0, ready: 0, soon: 0, early: 0, past: 0, none: 0 };
  for (const w of inRange) {
    if (w.owned <= 0) continue;
    drink.onHand += w.owned;
    const dw = currentWindow(w);
    if (!dw) drink.none += w.owned;
    else drink[windowStatus(dw, now)] += w.owned;
  }

  const coverage: Dashboard['coverage'] = [
    { id: 'rating', label: 'Ratings', have: rated.length, total: inRange.length },
    { id: 'tasted', label: 'Tasting dates', have: kpis.tasted, total: inRange.length },
    { id: 'price', label: 'Prices', have: priced.length, total: inRange.length },
  ];

  // --- Written highlights, each only when the numbers make a real difference.
  const highlights: Highlight[] = [];
  const overall = kpis.lovedRate;
  const big = countries.filter((r) => r.rated >= MIN.highlightRated);
  if (big.length >= 2 && big[0].rate - big[big.length - 1].rate >= 0.15) {
    const best = big[0];
    const worst = big[big.length - 1];
    highlights.push({
      id: 'country',
      parts: [{ t: 'You love ' }, { t: pct(best.rate), b: true }, { t: ` of the ${best.label} wines you’ve rated, but only ` }, { t: pct(worst.rate), b: true }, { t: ` of ${worst.label}.` }],
    });
  }
  if (weekdays && weekdays.total >= 20 && weekdays.counts[weekdays.top] / weekdays.total >= 0.4) {
    highlights.push({
      id: 'weekday',
      parts: [{ t: `${DAY_NAMES[weekdays.top]} is your tasting day: ` }, { t: `${weekdays.counts[weekdays.top]} of ${weekdays.total}`, b: true }, { t: ' tastings.' }],
    });
  }
  const bands = prices.filter((r) => r.rated >= MIN.band).sort(byRate);
  if (pricedRatedWines.length >= MIN.priceRated && bands.length >= 2 && bands[0].rate - bands[bands.length - 1].rate >= 0.15) {
    const b = bands[0];
    highlights.push({
      id: 'price',
      parts: [{ t: 'Your best price band is ' }, { t: b.label, b: true }, { t: ': you love ' }, { t: `${b.loved} of ${b.rated}`, b: true }, { t: ' rated wines there.' }],
    });
  }
  const weakest = grapes.filter((r) => r.rated >= 8).sort((a, b) => a.rate - b.rate)[0];
  if (weakest && overall !== null && rated.length >= MIN.highlightRated && overall - weakest.rate >= 0.15) {
    highlights.push({
      id: 'grape',
      parts: [{ t: weakest.label, b: true }, { t: ' is your weakest grape: you love only ' }, { t: `${weakest.loved} of ${weakest.rated}`, b: true }, { t: ' rated.' }],
    });
  }

  return {
    filter,
    count: inRange.length,
    kpis,
    weeks: weeks.length >= MIN.weeks ? weeks : [],
    change,
    peak,
    weekdays,
    grapes,
    grapesPending,
    grapeMostRated,
    countries,
    prices,
    pricedRated: pricedRatedWines.length,
    drink,
    coverage,
    highlights,
  };
}
