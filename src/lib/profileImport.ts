import { createWine, db, emptyDraft, type PalateDB } from '../db';
import type { Wine, WineDraft } from '../types';
import { canonicalGrape, factsFromText, findAppellation, findGrapes } from './appellations';
import { norm } from './catalogNorm';
import { saveProfile, type ImportItem, type ImportPlan } from './profile';

/**
 * Carries out an import planned by planImport: each bottle is identified in Palate's wine catalog
 * (free) to split producer from cuvée and fill in region, grapes, colour and a bottle photo, then
 * added — unless the same wine and vintage is already in Palate, which is left exactly as it is.
 */

export interface ImportResult {
  added: number;
  alreadyThere: string[];
}

const words = (s: string) => new Set(norm(s).split(' ').filter(Boolean));
const sameWords = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((t) => b.has(t));

/** The wine in your collection (or lists) with the same name and vintage, if any. */
export function existingFor(item: Pick<ImportItem, 'name' | 'vintage'>, wines: Wine[]): Wine | undefined {
  const want = words(item.name);
  return wines.find((w) => (w.vintage === item.vintage || (w.vintage === null && item.vintage === null)) && sameWords(words(`${w.producer} ${w.name}`), want));
}

/**
 * When the catalog doesn't know a wine, Palate's appellation guide still can: the producer is what
 * comes before the first appellation or grape in the name ("Domaine X Saint-Joseph Les Granits").
 */
export function guideSplit(full: string): { producer: string; name: string } | null {
  const words = full.split(/\s+/).filter(Boolean);
  const app = findAppellation(full);
  const grapes = findGrapes(full);
  if (!app && !grapes.length) return null;
  // Drop words from the front while the rest still names everything the guide recognised.
  let k = 0;
  while (k < words.length - 1 && sameFinds(words.slice(k + 1).join(' '), app, grapes)) k++;
  return k ? { producer: words.slice(0, k).join(' '), name: words.slice(k).join(' ') } : null;
}

function sameFinds(tail: string, app: ReturnType<typeof findAppellation>, grapes: string[]): boolean {
  return (app === null || findAppellation(tail) === app) && grapes.every((g) => findGrapes(tail).includes(g));
}

/**
 * Grapes to save: the catalog's, unless they contradict the name ("Pouilly-Fuissé" is Chardonnay,
 * whatever a shop typed). Only a grape the name states, or the one grape an appellation allows, is
 * filled in from the guide.
 */
export function checkedGrapes(full: string, catalog: string[]): string[] {
  const f = factsFromText(full);
  const sure = f.namedGrapes.length ? f.namedGrapes : f.appellation?.grapes.length === 1 ? f.appellation.grapes : [];
  const allowed = f.namedGrapes.length ? f.namedGrapes : (f.appellation?.grapes ?? []);
  catalog = [...new Set(catalog.map(canonicalGrape))];
  if (!catalog.length) return sure;
  if (!allowed.length) return catalog;
  const overlap = catalog.some((g) => allowed.includes(g));
  return overlap ? catalog : sure;
}

/** "RIOJA" → "Rioja"; anything already in mixed case is left alone. */
const titleIfShouting = (s: string) => (s && s === s.toUpperCase() && /[A-Z]/.test(s) ? s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) : s);

export async function runImport(
  plan: ImportPlan,
  onProgress?: (done: number, total: number) => void,
  database: PalateDB = db,
  identify: (name: string) => Promise<Awaited<ReturnType<typeof import('./catalog').catalogIdentify>>> = async (name) =>
    (await import('./catalog')).catalogIdentify(name),
): Promise<ImportResult> {
  const current = await database.wines.toArray();
  const todo = plan.items.filter((it) => !existingFor(it, current));
  const alreadyThere = plan.items.filter((it) => existingFor(it, current)).map((it) => [it.name, it.vintage].filter(Boolean).join(' '));
  let done = 0;
  onProgress?.(0, todo.length);

  const drafts: WineDraft[] = new Array(todo.length);
  const one = async (it: ImportItem, i: number) => {
    // One retry: a busy catalog can time out once.
    const found = await identify(it.name).catch(() => identify(it.name)).catch(() => null);
    const d = found?.details;
    const f = factsFromText(it.name);
    const split = found ?? guideSplit(it.name);
    const style = d && d.style !== 'unknown' ? d.style : null;
    drafts[i] = {
      ...emptyDraft(),
      producer: split?.producer ?? '',
      name: split ? split.name : it.name,
      vintage: it.vintage,
      country: d?.country || f.country || findAppellation(d?.region ?? '')?.country || '',
      // The appellation in the name (Barolo, Pauillac) is more specific than a catalog region (Piedmont, Bordeaux).
      region: f.appellation?.name || titleIfShouting(d?.region ?? ''),
      grapes: checkedGrapes(it.name, d?.grapes ?? []),
      style: f.style && style !== f.style ? f.style : style,
      rating: it.rating,
      owned: it.kind === 'owned' ? 1 : 0,
      notes: it.notes,
      tastedOn: it.tastedOn,
      photo: d?.photo ? { kind: 'remote', url: d.photo.url, source: { name: d.photo.siteName, pageUrl: d.photo.pageUrl, title: it.name } } : null,
      list: it.kind === 'want' ? 'want' : null,
    };
    onProgress?.(++done, todo.length);
  };
  // One at a time: parallel catalog searches time out.
  for (let k = 0; k < todo.length; k++) await one(todo[k], k);
  for (const d of drafts) await createWine(d, database);
  saveProfile(plan.profile);
  return { added: drafts.length, alreadyThere };
}
