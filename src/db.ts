import Dexie, { type EntityTable } from 'dexie';
import type { Deletion, StoredPhoto, Wine, WineDraft } from './types';
import type { StoreCache } from './lib/stores';

export class PalateDB extends Dexie {
  wines!: EntityTable<Wine, 'id'>;
  photos!: EntityTable<StoredPhoto, 'id'>;
  /** Wines deleted on this device that other devices haven't heard about yet. */
  deletions!: EntityTable<Deletion, 'id'>;
  /** Store wine lists and suggestion lists, saved on this device so they open offline. */
  stores!: EntityTable<StoreCache, 'id'>;

  constructor(name = 'palate') {
    super(name);
    this.version(1).stores({
      wines: 'id, updatedAt, createdAt, rating, country, style, producer, barcode',
      photos: 'id',
    });
    this.version(2).stores({ deletions: 'id' });
    this.version(3).stores({ stores: 'id' });
  }
}

export const db = new PalateDB();

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyDraft(): WineDraft {
  return {
    producer: '',
    name: '',
    vintage: null,
    country: '',
    region: '',
    grapes: [],
    style: null,
    price: null,
    store: '',
    rating: null,
    owned: 0,
    notes: '',
    about: null,
    tastedOn: null,
    barcode: '',
    photo: null,
  };
}

export async function createWine(draft: WineDraft, database: PalateDB = db): Promise<string> {
  const now = Date.now();
  const id = newId();
  await database.wines.add({ ...draft, id, createdAt: now, updatedAt: now });
  return id;
}

export async function updateWine(
  id: string,
  changes: Partial<WineDraft>,
  database: PalateDB = db,
): Promise<void> {
  const before = await database.wines.get(id);
  await database.wines.update(id, { ...changes, updatedAt: Date.now() });
  // Drop the old local photo if it was replaced.
  if (
    'photo' in changes &&
    before?.photo?.kind === 'local' &&
    (changes.photo?.kind !== 'local' || changes.photo.blobId !== before.photo.blobId)
  ) {
    await database.photos.delete(before.photo.blobId);
  }
}

export async function deleteWine(id: string, database: PalateDB = db): Promise<void> {
  await database.transaction('rw', database.wines, database.photos, database.deletions, async () => {
    const wine = await database.wines.get(id);
    if (wine?.photo?.kind === 'local') await database.photos.delete(wine.photo.blobId);
    await database.wines.delete(id);
    await database.deletions.put({ id, deletedAt: Date.now() });
  });
}

export async function savePhoto(
  blob: Blob,
  width: number,
  height: number,
  database: PalateDB = db,
): Promise<string> {
  const id = newId();
  await database.photos.add({ id, blob, width, height });
  return id;
}

/** Remove photos no longer referenced by any wine (e.g. from an abandoned add form). */
export async function prunePhotos(database: PalateDB = db): Promise<number> {
  const wines = await database.wines.toArray();
  const used = new Set(
    wines.flatMap((w) => (w.photo?.kind === 'local' ? [w.photo.blobId] : [])),
  );
  const ids = (await database.photos.toCollection().primaryKeys()) as string[];
  const orphans = ids.filter((id) => !used.has(id));
  await database.photos.bulkDelete(orphans);
  return orphans.length;
}
