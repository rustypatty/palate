import { createWine, db, emptyDraft, type PalateDB } from '../db';
import type { Wine, WineDraft, WineStyle } from '../types';
import { APPELLATIONS, canonicalGrape, findAppellation } from './appellations';
import { cleanGrapes } from './catalog';
import { norm } from './catalogNorm';
import type { NextStep } from './passport';
import { SUPABASE_KEY, SUPABASE_URL } from './supabaseConfig';

/**
 * Learning paths: for a passport suggestion ("Syrah from Northern Rhône"), about five bottles
 * from Palate's catalog to taste your way into it. Free: one catalog read, no Claude. Widely
 * sold wines first (the classic names), one per producer, spread across the places suggested
 * (the rest of the area only when those are too few), under $40, or under $60 when a place
 * rarely comes cheaper. Prices are the lowest seen at US shops, not at your stores.
 */

export const PATH_SIZE = 5;
export const BUDGET = 40;
export const STRETCH = 60;
const FLOOR = 10;

export interface CatalogRow {
  wine_id: string;
  producer: string | null;
  cuvee: string | null;
  display_name: string | null;
  appellation: string | null;
  wine_type: string | null;
  grapes: string[] | null;
  min_usd_750: number | string | null;
  source_count: number | null;
}

export interface PathBottle {
  wineId: string;
  producer: string;
  name: string;
  appellation: string;
  style: WineStyle | null;
  grapes: string[];
  price: number;
}

export interface LearningPath {
  bottles: PathBottle[];
  /** The price limit used: BUDGET, or STRETCH when too few came under it. */
  budget: number;
}

/** Where to look: the places named, then the rest of that area for the same grape (cheaper names often live there). */
export function pathAppellations(step: NextStep): string[] {
  const more = step.area
    ? APPELLATIONS.filter((a) => a.area === step.area && a.grapes.length > 0 && (!step.grape || a.grapes[0] === step.grape) && (!step.style || !a.style || a.style === step.style)).map((a) => a.name)
    : [];
  return [...new Set([...step.tryThese, ...more])];
}

/** The catalog spells some with spaces ("Saint Joseph"): ask for both. */
const spellings = (names: string[]) => [...new Set(names.flatMap((n) => [n, n.replace(/-/g, ' ')]))];

const STYLES: WineStyle[] = ['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified'];

/** Strip the producer from the start of a catalog cuvée or display name. */
function wineName(r: CatalogRow): string {
  const producer = norm(r.producer);
  const raw = (r.cuvee || r.display_name || '').trim();
  const words = raw.split(/\s+/);
  for (let i = words.length; i > 0; i--) {
    if (norm(words.slice(0, i).join(' ')) === producer) return words.slice(i).join(' ') || raw;
  }
  return raw;
}

/** Pick the path from catalog rows: within the budget, the right colour and grape, one per producer, not ones you have. */
export function pickPath(rows: CatalogRow[], step: NextStep, mine: Wine[]): LearningPath {
  const order = pathAppellations(step);
  const placeOf = (r: CatalogRow) => findAppellation(r.appellation ?? '')?.name ?? r.appellation ?? '';
  const yours = new Set(mine.filter((w) => w.list !== 'passed').map((w) => `${norm(w.producer)}|${findAppellation(`${w.region} ${w.name}`)?.name ?? ''}`));
  const fits = rows.filter((r) => {
    if (!r.producer?.trim()) return false;
    if (step.style && r.wine_type && r.wine_type !== step.style) return false;
    const grapes = cleanGrapes(r.grapes).map(canonicalGrape);
    if (step.grape && grapes.length && !grapes.includes(step.grape)) return false;
    return !yours.has(`${norm(r.producer)}|${placeOf(r)}`);
  });

  const pick = (budget: number, only?: string[]): PathBottle[] => {
    const within = fits.filter((r) => Number(r.min_usd_750) >= FLOOR && Number(r.min_usd_750) <= budget && (!only || only.includes(placeOf(r))));
    // Best-known first within each place, then take one from each place in turn.
    const byPlace = new Map<string, CatalogRow[]>();
    for (const r of [...within].sort((a, b) => (b.source_count ?? 0) - (a.source_count ?? 0))) {
      const p = placeOf(r);
      byPlace.set(p, [...(byPlace.get(p) ?? []), r]);
    }
    const places = [...byPlace.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    const out: PathBottle[] = [];
    const producers = new Set<string>();
    for (let round = 0; out.length < PATH_SIZE && places.some((p) => byPlace.get(p)!.length); round++) {
      for (const p of places) {
        const queue = byPlace.get(p)!;
        while (queue.length && producers.has(norm(queue[0].producer))) queue.shift();
        const r = queue.shift();
        if (!r || out.length >= PATH_SIZE) continue;
        producers.add(norm(r.producer));
        out.push({
          wineId: r.wine_id,
          producer: r.producer!.trim(),
          name: wineName(r),
          appellation: p,
          style: STYLES.includes(r.wine_type as WineStyle) ? (r.wine_type as WineStyle) : null,
          grapes: cleanGrapes(r.grapes),
          price: Math.round(Number(r.min_usd_750)),
        });
      }
    }
    return out;
  };

  // The places suggested first; the rest of the area (or a higher budget) only when that's too few.
  for (const budget of [BUDGET, STRETCH]) {
    const named = pick(budget, step.tryThese);
    // Enough, and from more than one place (unless only one was suggested): contrast is how you learn.
    const placesCovered = new Set(named.map((b) => b.appellation)).size;
    if (named.length >= PATH_SIZE - 1 && (placesCovered > 1 || step.tryThese.length === 1)) return { bottles: named, budget };
    const wider = pick(budget);
    if (wider.length >= 3) return { bottles: wider, budget };
  }
  return { bottles: pick(STRETCH), budget: STRETCH };
}

/** One catalog read for the path's places (read-only, free). */
export async function fetchPathRows(step: NextStep, signal?: AbortSignal): Promise<CatalogRow[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  const names = spellings(pathAppellations(step)).map((n) => `"${n.replace(/"/g, '')}"`).join(',');
  const q = new URLSearchParams({
    select: 'wine_id,producer,cuvee,display_name,appellation,wine_type,grapes,min_usd_750,source_count',
    appellation: `in.(${names})`,
    order: 'source_count.desc.nullslast',
    limit: '300',
  });
  q.append('min_usd_750', `gte.${FLOOR}`);
  q.append('min_usd_750', `lte.${STRETCH}`);
  if (step.style) q.append('wine_type', `eq.${step.style}`);
  const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/catalog_wines?${q}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    signal: signal ?? AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  return (await res.json()) as CatalogRow[];
}

export async function learningPath(step: NextStep, mine: Wine[], signal?: AbortSignal): Promise<LearningPath> {
  return pickPath(await fetchPathRows(step, signal), step, mine);
}

/** A path bottle as a Want to try wine, saying which path it came from and its usual price. */
export function draftFromPath(b: PathBottle, step: NextStep): WineDraft {
  const app = findAppellation(b.appellation);
  return {
    ...emptyDraft(),
    producer: b.producer,
    name: b.name,
    region: b.appellation,
    country: app?.country ?? '',
    grapes: b.grapes,
    style: b.style,
    suggestion: { reason: `Learning path: ${step.title}. Usually about $${b.price}.`, source: 'Wine passport', at: Date.now() },
  };
}

export function savePathBottle(b: PathBottle, step: NextStep, database: PalateDB = db) {
  return createWine({ ...draftFromPath(b, step), list: 'want' }, database);
}
