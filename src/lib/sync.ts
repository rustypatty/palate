import { db, type PalateDB } from '../db';
import type { StoredPhoto, Wine } from '../types';
import { sameValue } from './sameValue';

/**
 * Two-way sync between this device and the online copy.
 * Each wine is a row. When both sides changed the same wine, the two copies are combined field
 * by field (see mergeWines): a rating changed on the phone and a price added by the server's
 * price check both survive. When the same field changed on both, the later edit wins.
 * Deleted wines stay online as `deleted` rows so other devices remove them too.
 */

export interface RemoteMeta {
  id: string;
  updated_at: number;
  deleted: boolean;
}

export interface RemoteRow extends RemoteMeta {
  data: Wine | Record<string, never>;
}

export interface Remote {
  /** Every row's id and timestamp (cheap: no wine data). */
  list(): Promise<RemoteMeta[]>;
  /** Full rows for these ids. */
  fetch(ids: string[]): Promise<RemoteRow[]>;
  upsert(rows: RemoteRow[]): Promise<void>;
  uploadPhoto(id: string, blob: Blob): Promise<void>;
  /** null when the photo isn't online (e.g. it never finished uploading). */
  downloadPhoto(id: string): Promise<Blob | null>;
}

export interface SyncResult {
  sent: number;
  received: number;
  removed: number;
}

/**
 * One wine changed on two sides, combined: the newer copy, plus each field the older copy
 * changed more recently (by its fieldTimes). Wines without fieldTimes: the newer copy, whole.
 */
export function mergeWines(mine: Wine, theirs: Wine): Wine {
  const [newer, older] = theirs.updatedAt > mine.updatedAt ? [theirs, mine] : [mine, theirs];
  const merged: Wine = { ...newer };
  const times = { ...newer.fieldTimes };
  let took = false;
  for (const [key, time] of Object.entries(older.fieldTimes ?? {}) as [keyof Wine, number][]) {
    if (time > (times[key] ?? 0)) {
      Object.assign(merged, { [key]: older[key] });
      times[key] = time;
      took = true;
    }
  }
  if (took) merged.fieldTimes = times;
  return merged;
}

/** Same wine data, whatever the timestamp. */
const sameWine = (a: Wine, b: Wine) => sameValue({ ...a, updatedAt: 0 }, { ...b, updatedAt: 0 });

const rowOf = (w: Wine): RemoteRow => ({ id: w.id, updated_at: w.updatedAt, deleted: false, data: w });

export async function syncOnce(remote: Remote, database: PalateDB = db): Promise<SyncResult> {
  const remoteMeta = new Map((await remote.list()).map((r) => [r.id, r]));
  const local = new Map((await database.wines.toArray()).map((w) => [w.id, w]));
  const deletions = new Map((await database.deletions.toArray()).map((d) => [d.id, d]));

  // --- Rows to read: new or deleted online, or changed on both sides (to combine) ---
  const wanted: string[] = [];
  for (const r of remoteMeta.values()) {
    const w = local.get(r.id);
    const d = deletions.get(r.id);
    if (r.deleted) {
      if (w && w.updatedAt <= r.updated_at) wanted.push(r.id);
    } else if (w ? w.updatedAt !== r.updated_at : !(d && d.deletedAt >= r.updated_at)) {
      wanted.push(r.id);
    }
  }
  const fetched = new Map((wanted.length ? await remote.fetch(wanted) : []).map((r) => [r.id, r]));

  const outgoing: RemoteRow[] = [];
  const toPut: Wine[] = [];
  const toRemove: string[] = [];
  for (const w of local.values()) {
    const r = remoteMeta.get(w.id);
    const row = fetched.get(w.id);
    if (!r || (r.deleted && w.updatedAt > r.updated_at)) {
      // New here, or edited here after it was deleted elsewhere: the edit wins.
      outgoing.push(rowOf(w));
    } else if (row?.deleted) {
      toRemove.push(w.id);
    } else if (row) {
      const theirs: Wine = { ...(row.data as Wine), id: row.id, updatedAt: row.updated_at };
      const merged = mergeWines(w, theirs);
      if (sameWine(merged, theirs)) {
        // The online copy already has everything: take it, timestamp and all.
        toPut.push(theirs);
      } else {
        // Something only this device has: send the combined copy, dated after the online one.
        merged.updatedAt = Math.max(w.updatedAt, theirs.updatedAt + 1);
        outgoing.push(rowOf(merged));
        if (!sameWine(merged, w) || merged.updatedAt !== w.updatedAt) toPut.push(merged);
      }
    }
  }
  for (const row of fetched.values()) {
    if (!row.deleted && !local.has(row.id)) toPut.push({ ...(row.data as Wine), id: row.id, updatedAt: row.updated_at });
  }

  const sentDeletions: string[] = [];
  for (const d of deletions.values()) {
    const r = remoteMeta.get(d.id);
    if (!r || r.deleted) sentDeletions.push(d.id); // nothing to tell
    else if (d.deletedAt >= r.updated_at) {
      outgoing.push({ id: d.id, updated_at: d.deletedAt, deleted: true, data: {} });
      sentDeletions.push(d.id);
    }
    // else: edited elsewhere after the delete here — the edit wins and came back above.
  }

  // Photos go up before the wines that point at them.
  for (const row of outgoing) {
    const photo = !row.deleted ? (row.data as Wine).photo : null;
    if (photo?.kind !== 'local') continue;
    const p = await database.photos.get(photo.blobId);
    if (p && !p.uploaded) {
      await remote.uploadPhoto(p.id, p.blob);
      await database.photos.update(p.id, { uploaded: true });
    }
  }
  if (outgoing.length) await remote.upsert(outgoing);

  // Download photos first: IndexedDB transactions can't wait on the network.
  const newPhotos: StoredPhoto[] = [];
  for (const w of toPut) {
    if (w.photo?.kind !== 'local' || (await database.photos.get(w.photo.blobId))) continue;
    const blob = await remote.downloadPhoto(w.photo.blobId).catch(() => null);
    if (blob) newPhotos.push({ id: w.photo.blobId, blob, width: 0, height: 0, uploaded: true });
  }

  await database.transaction('rw', database.wines, database.photos, database.deletions, async () => {
    if (newPhotos.length) await database.photos.bulkPut(newPhotos);
    // Re-check against the current copy: a wine edited here while syncing keeps that edit,
    // and is combined with the online copy next time.
    const ids = [...toPut.map((w) => w.id), ...toRemove];
    const now = new Map((await database.wines.bulkGet(ids)).flatMap((w) => (w ? [[w.id, w] as const] : [])));
    const unchanged = (id: string) => now.get(id)?.updatedAt === local.get(id)?.updatedAt;
    const puts = toPut.filter((w) => unchanged(w.id));
    if (puts.length) await database.wines.bulkPut(puts);
    for (const id of toRemove) {
      const w = now.get(id);
      if (!w || !unchanged(id)) continue;
      if (w.photo?.kind === 'local') await database.photos.delete(w.photo.blobId);
      await database.wines.delete(id);
    }
    // Deletions now online, or overruled by a later edit elsewhere.
    await database.deletions.bulkDelete([...sentDeletions, ...toPut.map((w) => w.id)]);
  });

  return { sent: outgoing.length, received: toPut.length, removed: toRemove.length };
}
