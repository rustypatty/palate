import { db, updateWine, type PalateDB } from '../db';
import type { Wine, WineLesson } from '../types';
import { canonicalGrape, findAppellation } from './appellations';
import { producerAndName } from './format';

/**
 * "Learn" on a wine page: why this wine tastes the way it does (the grape, the place, the
 * making, and one thing to taste for), plus the other bottles in your cellar that share its
 * grape or place, so you can compare. The connections are worked out here, free; the lesson
 * is written once by Claude and kept with the wine, so it syncs and reopening is free.
 */

export interface CellarLink {
  kind: 'place' | 'grape';
  label: string;
  wines: Wine[];
}

const PER_LINK = 4;
const placeOf = (w: Wine) => findAppellation(`${w.region} ${w.name}`);
const grapesOf = (w: Wine) => [...new Set(w.grapes.map(canonicalGrape).filter(Boolean))];

/** Your other bottles from the same place, then with the same grapes; each bottle shown once. */
export function cellarLinks(wine: Wine, wines: Wine[]): CellarLink[] {
  const pool = wines.filter((w) => w.id !== wine.id && w.list !== 'passed');
  const shown = new Set<string>();
  const out: CellarLink[] = [];
  const add = (kind: CellarLink['kind'], label: string, match: (w: Wine) => boolean) => {
    const found = pool.filter((w) => !shown.has(w.id) && match(w)).slice(0, PER_LINK);
    if (!found.length) return;
    found.forEach((w) => shown.add(w.id));
    out.push({ kind, label, wines: found });
  };

  const app = placeOf(wine);
  if (app) {
    add('place', `Also from ${app.name}`, (w) => placeOf(w)?.name === app.name);
    add('place', `Elsewhere in ${app.area}`, (w) => placeOf(w)?.area === app.area);
  } else if (wine.region.trim()) {
    const region = wine.region.trim().toLowerCase();
    add('place', `Also from ${wine.region.trim()}`, (w) => w.region.trim().toLowerCase() === region);
  }
  for (const grape of grapesOf(wine).slice(0, 2)) add('grape', `Also ${grape}`, (w) => grapesOf(w).includes(grape));
  return out;
}

/** Worth a lesson: a wine you have or want, with a name, and no lesson yet. */
export function needsLesson(w: Wine): boolean {
  return !w.lesson && w.list !== 'passed' && Boolean(w.producer || w.name);
}

export interface LessonRequest {
  producer: string;
  name: string;
  vintage: string;
  region: string;
  country: string;
  style: string;
  grapes: string[];
  /** Your other bottles that share its grape or place, to compare with. */
  related: string[];
}

export type LessonOutcome = { ok: true; lesson: Omit<WineLesson, 'writtenAt'> } | { ok: false; reason: string };

export function lessonRequest(wine: Wine, wines: Wine[]): LessonRequest {
  return {
    producer: wine.producer,
    name: wine.name,
    vintage: wine.vintage === null ? '' : String(wine.vintage),
    region: wine.region,
    country: wine.country,
    style: wine.style ?? '',
    grapes: wine.grapes,
    related: cellarLinks(wine, wines).flatMap((l) => l.wines.map((w) => `${producerAndName(w)}${w.rating === 'loved' ? ' (I loved it)' : w.rating === 'liked' ? ' (I liked it)' : ''}`)),
  };
}

async function writeWithClaude(req: LessonRequest): Promise<LessonOutcome> {
  const { getApiKey } = await import('./labelReader');
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, reason: 'add your Anthropic API key in My palate first' };
  return (await import('./learnClient')).lessonWithClaude(apiKey, req);
}

const inFlight = new Map<string, Promise<LessonOutcome>>();

/** Writes and saves the lesson; one request per wine at a time, however often it's asked for. */
export function writeLesson(
  wine: Wine,
  wines: Wine[],
  database: PalateDB = db,
  write: (req: LessonRequest) => Promise<LessonOutcome> = writeWithClaude,
): Promise<LessonOutcome> {
  const running = inFlight.get(wine.id);
  if (running) return running;
  const job = write(lessonRequest(wine, wines))
    .then(async (out) => {
      if (out.ok) await updateWine(wine.id, { lesson: { ...out.lesson, writtenAt: Date.now() } }, database);
      return out;
    })
    .catch((e: unknown): LessonOutcome => ({ ok: false, reason: e instanceof Error ? e.message : 'unexpected error' }))
    .finally(() => inFlight.delete(wine.id));
  inFlight.set(wine.id, job);
  return job;
}
