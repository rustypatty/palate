import { canonicalGrape } from './appellations';
import { catalogConfigured, catalogWineIds, cleanGrapes } from './catalog';
import { noteKey } from './catalogNotes';
import { SUPABASE_KEY, SUPABASE_URL } from './supabaseConfig';

/**
 * What Palate's wine catalog knows about a wine's grapes and sub-region, for the wine page's
 * Grapes, Structure and Region sections when the wine itself doesn't say. Free; kept on this
 * device for a month (a miss too), so reopening a page doesn't ask again.
 */

export interface CatalogFacts {
  grapes: string[];
  subregion: string;
}

const KEY = 'palate.catalogFacts';
const KEEP_MS = 30 * 24 * 3600 * 1000;
type Saved = Record<string, CatalogFacts & { at: number }>;

function saved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
}

export function cachedFacts(producer: string, name: string, now = Date.now()): CatalogFacts | null {
  const hit = saved()[noteKey(producer, name)];
  return hit && now - hit.at < KEEP_MS ? { grapes: hit.grapes, subregion: hit.subregion } : null;
}

function keep(producer: string, name: string, facts: CatalogFacts) {
  try {
    const all = saved();
    all[noteKey(producer, name)] = { ...facts, at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full or unavailable: asked again next time */
  }
}

/** The catalog's grapes and sub-region for a wine; empty when it isn't a sure match. */
export async function catalogFacts(producer: string, name: string): Promise<CatalogFacts> {
  const cached = cachedFacts(producer, name);
  if (cached) return cached;
  const none = { grapes: [], subregion: '' };
  if (!catalogConfigured || !(producer || name)) return none;
  const ids = await catalogWineIds(producer, name);
  let facts: CatalogFacts = none;
  if (ids.length) {
    const url = `${SUPABASE_URL}/rest/v1/catalog_wines?select=wine_id,grapes,subregion,source_count&wine_id=in.(${ids.map((id) => `"${id}"`).join(',')})`;
    const res = await fetch(url, { headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const rows = (await res.json()) as { wine_id: string; grapes: string[] | null; subregion: string | null; source_count: number | null }[];
    facts = { grapes: votedGrapes(rows), subregion: ids.map((id) => rows.find((r) => r.wine_id === id)?.subregion?.trim() ?? '').find(Boolean) ?? '' };
  }
  keep(producer, name, facts);
  return facts;
}

/**
 * The grapes the catalog's entries for a wine agree on, most-listed first. Shops list a blend's
 * grapes in no set order, so the grape most of them name comes first ("Zinfandel" for Ridge
 * Lytton Springs, which some list after Carignan).
 */
export function votedGrapes(rows: { grapes: string[] | null; source_count: number | null }[]): string[] {
  const votes = new Map<string, number>();
  for (const r of rows) {
    for (const g of new Set(cleanGrapes(r.grapes).map(canonicalGrape))) votes.set(g, (votes.get(g) ?? 0) + Math.max(1, r.source_count ?? 1));
  }
  return [...votes.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
}
