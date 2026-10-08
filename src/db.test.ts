// @vitest-environment node
// (jsdom’s Blob does not survive fake-indexeddb’s structured clone; Node’s does.)
import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { createWine, deleteWine, emptyDraft, PalateDB, prunePhotos, savePhoto, updateWine } from './db';
import { exportBackup, importBackup } from './lib/backup';

let db: PalateDB;
beforeEach(async () => {
  db = new PalateDB(`test-${Math.random()}`);
  await db.open();
});

const photoBlob = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });

describe('wine storage', () => {
  it('creates, updates and deletes wines with their photos', async () => {
    const blobId = await savePhoto(photoBlob(), 10, 20, db);
    const id = await createWine({ ...emptyDraft(), producer: 'Ridge', photo: { kind: 'local', blobId } }, db);
    await updateWine(id, { rating: 'loved', owned: 3 }, db);
    const w = await db.wines.get(id);
    expect(w).toMatchObject({ producer: 'Ridge', rating: 'loved', owned: 3 });
    expect(w!.updatedAt).toBeGreaterThanOrEqual(w!.createdAt);

    await deleteWine(id, db);
    expect(await db.wines.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
  });

  it('removes the old photo when a wine’s photo is replaced', async () => {
    const a = await savePhoto(photoBlob(), 1, 1, db);
    const b = await savePhoto(photoBlob(), 1, 1, db);
    const id = await createWine({ ...emptyDraft(), photo: { kind: 'local', blobId: a } }, db);
    await updateWine(id, { photo: { kind: 'local', blobId: b } }, db);
    expect(await db.photos.get(a)).toBeUndefined();
    expect(await db.photos.get(b)).toBeDefined();
  });

  it('prunes photos no wine uses', async () => {
    const used = await savePhoto(photoBlob(), 1, 1, db);
    await savePhoto(photoBlob(), 1, 1, db);
    await createWine({ ...emptyDraft(), photo: { kind: 'local', blobId: used } }, db);
    expect(await prunePhotos(db)).toBe(1);
    expect((await db.photos.toArray()).map((p) => p.id)).toEqual([used]);
  });
});

describe('backup', () => {
  it('round-trips wines and photos', async () => {
    const blobId = await savePhoto(photoBlob(), 10, 20, db);
    await createWine({ ...emptyDraft(), producer: 'Tempier', grapes: ['Mourvèdre'], photo: { kind: 'local', blobId } }, db);
    const file = await exportBackup(db);

    const other = new PalateDB(`test-restore-${Math.random()}`);
    const result = await importBackup(file, other);
    expect(result).toEqual({ wines: 1, photos: 1 });
    const [w] = await other.wines.toArray();
    expect(w.producer).toBe('Tempier');
    const p = await other.photos.get(blobId);
    expect(new Uint8Array(await p!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('rejects files that are not backups', async () => {
    await expect(importBackup(new Blob(['{"hello":1}']), db)).rejects.toThrow(/isn’t a Palate backup/);
    await expect(importBackup(new Blob(['nope']), db)).rejects.toThrow(/isn’t a Palate backup/);
  });
});

describe('price watch upgrade', () => {
  it('gives existing wines watch off and an empty price history, without touching updatedAt', async () => {
    const name = `upgrade-${Math.random()}`;
    const old = new Dexie(name);
    old.version(3).stores({ wines: 'id, updatedAt, createdAt, rating, country, style, producer, barcode', photos: 'id', deletions: 'id', stores: 'id' });
    await old.table('wines').add({ ...emptyDraft(), id: 'x', createdAt: 1, updatedAt: 5 });
    old.close();
    const fresh = new PalateDB(name);
    const w = await fresh.wines.get('x');
    expect(w).toMatchObject({ watch: false, priceHistory: [], updatedAt: 5 });
    fresh.close();
  });
});
