import { db, updateWine, type PalateDB } from '../db';
import type { Wine } from '../types';
import { describeWine, type DescribeOutcome, type DescribeRequest } from './coach';
import { shelfContext } from './shelf';
import { buildTaste } from './taste';

/**
 * Palate's written description of a wine (what it is, how it tastes, how it fits you, how to
 * serve it): written once by Claude, about 3¢, then saved with the wine so it syncs and
 * reopening the page is free.
 */

const RATING_SAID = { loved: 'I loved it', liked: 'I liked it', wouldnt: 'I would not buy it again' } as const;

/** What you've said or done with this wine, in a line for Claude. */
export function mineLine(w: Wine): string {
  const parts = [
    w.rating ? RATING_SAID[w.rating] : w.list === 'want' ? 'On my want-to-try list' : 'Not tasted yet',
    w.owned > 0 ? `I have ${w.owned} ${w.owned === 1 ? 'bottle' : 'bottles'}` : '',
    w.tastedOn ? `tasted ${w.tastedOn}` : '',
    w.notes.trim() ? `my notes: "${w.notes.trim().replace(/\s+/g, ' ').slice(0, 400)}"` : '',
  ];
  return parts.filter(Boolean).join('; ') + '.';
}

/** Worth describing: a wine you have or want, with a name, and no description yet. */
export function needsTake(w: Wine): boolean {
  return !w.take && w.list !== 'passed' && Boolean(w.producer || w.name);
}

const inFlight = new Map<string, Promise<DescribeOutcome>>();

/** Writes and saves the description; one request per wine at a time, however often it's asked for. */
export function writeTake(
  wine: Wine,
  wines: Wine[],
  database: PalateDB = db,
  describe: (req: DescribeRequest) => Promise<DescribeOutcome> = describeWine,
): Promise<DescribeOutcome> {
  const running = inFlight.get(wine.id);
  if (running) return running;
  const others = wines.filter((w) => w.list !== 'want' && w.list !== 'passed');
  const req: DescribeRequest = {
    producer: wine.producer,
    name: wine.name,
    vintage: wine.vintage === null ? '' : String(wine.vintage),
    region: wine.region,
    country: wine.country,
    style: wine.style ?? '',
    grapes: wine.grapes,
    price: wine.price,
    mine: mineLine(wine),
    context: shelfContext(others, buildTaste(others)),
  };
  const job = describe(req)
    .then(async (out) => {
      if (out.ok) await updateWine(wine.id, { take: { ...out.take, writtenAt: Date.now(), rating: wine.rating } }, database);
      return out;
    })
    .catch((e: unknown): DescribeOutcome => ({ ok: false, reason: e instanceof Error ? e.message : 'unexpected error' }))
    .finally(() => inFlight.delete(wine.id));
  inFlight.set(wine.id, job);
  return job;
}
