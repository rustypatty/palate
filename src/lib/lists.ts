import { createWine, db, emptyDraft, updateWine, type PalateDB } from '../db';
import type { Wine, WineDraft } from '../types';
import { findAppellation, findGrapes } from './appellations';
import { isSameWine, mentioned } from './insights';
import type { Store, StoreItem, SuggestedItem } from './stores';
import { tokens } from './text';

/** A store listing as a draft wine: only what the listing actually says, never inferred grapes. */
export function draftFromItem(item: StoreItem | SuggestedItem, store: Store, reason: string): WineDraft {
  const s = item as Partial<SuggestedItem>;
  const appellation = findAppellation(item.title);
  return {
    ...emptyDraft(),
    producer: s.producer ?? '',
    name: s.wine ?? item.title.replace(/\s*\b(19|20)\d{2}\b\s*$/, '').trim(),
    vintage: item.vintage,
    country: item.country || appellation?.country || '',
    region: s.region || appellation?.name || '',
    grapes: s.grapes?.length ? s.grapes : findGrapes(item.title),
    style: item.style,
    price: item.price,
    store: store.name,
    // The store's own product photo of this listing, or none (never a lookalike).
    photo: item.image ? { kind: 'remote', url: item.image, source: { name: store.name, pageUrl: item.url, title: item.title } } : null,
    suggestion: { reason, source: store.name, url: item.url, key: item.key, at: Date.now() },
  };
}

export function saveToWant(item: StoreItem | SuggestedItem, store: Store, reason: string, database: PalateDB = db) {
  return createWine({ ...draftFromItem(item, store, reason), list: 'want' }, database);
}

export function markNotForMe(item: StoreItem | SuggestedItem, store: Store, reason: string, database: PalateDB = db) {
  return createWine({ ...draftFromItem(item, store, reason), photo: null, list: 'passed' }, database);
}

/**
 * Is this Want to try wine the bottle described by `text`? Saved shop listings often
 * have no separate producer, so fall back to most of the listing's words being present.
 */
export function matchesWant(want: Wine, text: string): boolean {
  const q = tokens(text);
  if (!q.length) return false;
  if (want.producer) return isSameWine(want, q);
  const words = tokens(want.name).filter((t) => t.length > 2 && !/^\d+$/.test(t));
  if (words.length < 2) return false;
  const hit = words.filter((t) => mentioned(t, q)).length;
  return hit / words.length >= 0.75;
}

/**
 * Adding a wine that's on the Want to try list: fill in that entry instead of creating
 * a second one, so it keeps the suggestion it came from. Returns its id, or null.
 */
export async function adoptWant(draft: WineDraft, database: PalateDB = db): Promise<string | null> {
  const text = [draft.producer, draft.name, draft.vintage ?? ''].join(' ');
  const wants = (await database.wines.toArray()).filter((w) => w.list === 'want');
  const match = wants.find((w) => matchesWant(w, text));
  if (!match) return null;
  await updateWine(match.id, { ...draft, list: null, suggestion: match.suggestion ?? null, photo: draft.photo ?? match.photo }, database);
  return match.id;
}
