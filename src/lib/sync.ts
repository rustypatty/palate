import { db, type PalateDB } from '../db';
import type { StoredPhoto, Wine } from '../types';

/**
 * Two-way sync between this device and the online copy.
 * Each wine is a row; when both sides changed the same wine, the later edit wins.
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

export async function syncOnce(remote: Remote, database: PalateDB = db): Promise<SyncResult> {
  const remoteMeta = new Map((await remote.list()).map((r) => [r.id, r]));
  const local = new Map((await database.wines.toArray()).map((w) => [w.id, w]));
  const deletions = new Map((await database.deletions.toArray()).map((d) => [d.id, d]));

  // --- What this device has that's newer ---
  const outgoing: RemoteRow[] = [];
  for (const w of local.values()) {
    const r = remoteMeta.get(w.id);
    if (!r || w.updatedAt > r.updated_at) outgoing.push({ id: w.id, updated_at: w.updatedAt, deleted: false, data: w });
  }
  const sentDeletions: string[] = [];
  for (const d of deletions.values()) {
    const r = remoteMeta.get(d.id);
    if (!r || r.deleted) sentDeletions.push(d.id); // nothing to tell
    else if (d.deletedAt >= r.updated_at) {
      outgoing.push({ id: d.id, updated_at: d.deletedAt, deleted: true, data: {} });
      sentDeletions.push(d.id);
    }
    // else: edited elsewhere after the delete here — the edit wins and comes back below.
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

  // --- What's newer online ---
  const wanted: string[] = [];
  for (const r of remoteMeta.values()) {
    const w = local.get(r.id);
    const d = deletions.get(r.id);
    if (r.deleted) {
      if (w && w.updatedAt <= r.updated_at) wanted.push(r.id);
    } else if ((!w || r.updated_at > w.updatedAt) && !(d && d.deletedAt >= r.updated_at)) {
      wanted.push(r.id);
    }
  }
  const incoming = wanted.length ? await remote.fetch(wanted) : [];
  const toRemove = incoming.filter((r) => r.deleted).map((r) => r.id);
  const toPut = incoming.filter((r) => !r.deleted).map((r) => ({ ...(r.data as Wine), id: r.id, updatedAt: r.updated_at }));

  // Download photos first: IndexedDB transactions can't wait on the network.
  const newPhotos: StoredPhoto[] = [];
  for (const w of toPut) {
    if (w.photo?.kind !== 'local' || (await database.photos.get(w.photo.blobId))) continue;
    const blob = await remote.downloadPhoto(w.photo.blobId).catch(() => null);
    if (blob) newPhotos.push({ id: w.photo.blobId, blob, width: 0, height: 0, uploaded: true });
  }

  await database.transaction('rw', database.wines, database.photos, database.deletions, async () => {
    if (newPhotos.length) await database.photos.bulkPut(newPhotos);
    // Re-check against the current copy: the wine may have been edited here while syncing.
    const now = new Map((await database.wines.bulkGet(incoming.map((r) => r.id))).flatMap((w) => (w ? [[w.id, w] as const] : [])));
    const puts = toPut.filter((w) => !now.has(w.id) || now.get(w.id)!.updatedAt < w.updatedAt);
    if (puts.length) await database.wines.bulkPut(puts);
    for (const id of toRemove) {
      const w = now.get(id);
      if (!w || w.updatedAt > incoming.find((r) => r.id === id)!.updated_at) continue;
      if (w.photo?.kind === 'local') await database.photos.delete(w.photo.blobId);
      await database.wines.delete(id);
    }
    // Deletions now online, or overruled by a later edit elsewhere.
    await database.deletions.bulkDelete([...sentDeletions, ...toPut.map((w) => w.id)]);
  });

  return { sent: outgoing.length, received: toPut.length, removed: toRemove.length };
}
