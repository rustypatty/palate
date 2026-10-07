import { db, updateWine, type PalateDB } from '../db';
import type { Wine, WineTake } from '../types';
import { norm } from './catalogNorm';
import { SUPABASE_KEY, SUPABASE_URL } from './supabaseConfig';

/**
 * Written descriptions in Palate's wine catalog (Supabase table catalog_wine_notes): what a wine
 * is, how it tastes and how to serve it. They are shared, so they never hold anything about you;
 * "For you" is written on your device when you ask. Looking them up is free.
 */

export interface CatalogNote {
  name_key: string;
  vintage: number | null;
  what_it_is: string;
  taste: string;
  serve: string;
  caveat: string;
}

// Words that vary between how a shop, a label and you write the same wine.
const KEY_FILLER = new Set(['de', 'di', 'del', 'della', 'du', 'des', 'la', 'le', 'les', 'el', 'the', 'and', 'et', 'chateau', 'domaine', 'bodegas', 'bodega', 'weingut', 'tenuta', 'maison']);

/** The same key for "R. López de Heredia · Viña Bosconia Reserva" and "López de Heredia Viña Bosconia Reserva". */
const KEY_SAME: Record<string, string> = { '1er': 'premier', st: 'saint', ste: 'sainte' };

export function noteKey(producer: string, name: string): string {
  const tokens = norm(`${producer} ${name}`)
    .toLowerCase()
    .split(' ')
    .map((t) => KEY_SAME[t] ?? t)
    .filter((t) => t.length > 1 && !KEY_FILLER.has(t));
  return [...new Set(tokens)].sort().join(' ');
}

export const notesConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export async function fetchNotes(keys: string[], signal?: AbortSignal): Promise<CatalogNote[]> {
  if (!notesConfigured || !keys.length) return [];
  // Keep each request's address a sensible length.
  if (keys.length > 60) {
    const out: CatalogNote[] = [];
    for (let k = 0; k < keys.length; k += 60) out.push(...(await fetchNotes(keys.slice(k, k + 60), signal)));
    return out;
  }
  const list = keys.map((k) => `"${k.replace(/"/g, '')}"`).join(',');
  const url = `${SUPABASE_URL}/rest/v1/catalog_wine_notes?select=name_key,vintage,what_it_is,taste,serve,caveat&name_key=in.(${encodeURIComponent(list)})`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` }, signal });
  // Before the notes table exists, there's simply nothing to show.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`catalog notes ${res.status}`);
  return (await res.json()) as CatalogNote[];
}

/** The note for this wine: its own vintage first, else one written for any vintage. */
export function noteFor(w: Pick<Wine, 'producer' | 'name' | 'vintage'>, notes: CatalogNote[]): CatalogNote | null {
  const key = noteKey(w.producer, w.name);
  const mine = notes.filter((n) => n.name_key === key);
  const v = typeof w.vintage === 'number' ? w.vintage : null;
  return mine.find((n) => n.vintage !== null && n.vintage === v) ?? mine.find((n) => n.vintage === null) ?? null;
}

export function takeFromNote(n: CatalogNote, w: Pick<Wine, 'rating'>): WineTake {
  return { whatItIs: n.what_it_is, taste: n.taste, fit: '', serve: n.serve, caveat: n.caveat, writtenAt: Date.now(), rating: w.rating, source: 'catalog' };
}

/** Wines with no description yet that the catalog might describe. */
export const wantsNote = (w: Wine) => !w.take && w.list !== 'passed' && Boolean(w.producer || w.name);

/**
 * Fills in descriptions from the catalog for every wine that has none, in one request.
 * Returns how many were filled.
 */
export async function fillFromCatalog(wines: Wine[], database: PalateDB = db, fetcher: typeof fetchNotes = fetchNotes): Promise<number> {
  const todo = wines.filter(wantsNote);
  if (!todo.length) return 0;
  const notes = await fetcher([...new Set(todo.map((w) => noteKey(w.producer, w.name)))]);
  let filled = 0;
  for (const w of todo) {
    const n = noteFor(w, notes);
    if (!n) continue;
    // Re-read: the wine may have been described on its page meanwhile.
    const now = await database.wines.get(w.id);
    if (!now || now.take) continue;
    await updateWine(w.id, { take: takeFromNote(n, now) }, database);
    filled++;
  }
  return filled;
}
