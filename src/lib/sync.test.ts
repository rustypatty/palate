// @vitest-environment node
// (jsdom’s Blob does not survive fake-indexeddb’s structured clone; Node’s does.)
import { beforeEach, describe, expect, it } from 'vitest';
import { createWine, deleteWine, emptyDraft, PalateDB, savePhoto, updateWine } from '../db';
import { syncOnce, type Remote, type RemoteRow } from './sync';

/** An in-memory stand-in for the online copy, shared by two "devices". */
function memoryRemote() {
  const rows = new Map<string, RemoteRow>();
  const photos = new Map<string, Blob>();
  const remote: Remote = {
    list: async () => [...rows.values()].map(({ id, updated_at, deleted }) => ({ id, updated_at, deleted })),
    fetch: async (ids) => ids.flatMap((id) => (rows.has(id) ? [structuredClone(rows.get(id)!)] : [])),
    upsert: async (rs) => rs.forEach((r) => rows.set(r.id, structuredClone(r))),
    uploadPhoto: async (id, blob) => void photos.set(id, blob),
    downloadPhoto: async (id) => photos.get(id) ?? null,
  };
  return { remote, rows, photos };
}

let phone: PalateDB;
let laptop: PalateDB;
let cloud: ReturnType<typeof memoryRemote>;
beforeEach(async () => {
  phone = new PalateDB(`phone-${Math.random()}`);
  laptop = new PalateDB(`laptop-${Math.random()}`);
  await Promise.all([phone.open(), laptop.open()]);
  cloud = memoryRemote();
});

const tick = () => new Promise((r) => setTimeout(r, 2));
const photoBlob = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });

describe('sync', () => {
  it('copies wines and photos from one device to another', async () => {
    const blobId = await savePhoto(photoBlob(), 10, 20, phone);
    const id = await createWine({ ...emptyDraft(), producer: 'Ridge', photo: { kind: 'local', blobId } }, phone);

    expect(await syncOnce(cloud.remote, phone)).toEqual({ sent: 1, received: 0, removed: 0 });
    expect(cloud.photos.has(blobId)).toBe(true);
    expect((await phone.photos.get(blobId))!.uploaded).toBe(true);

    expect(await syncOnce(cloud.remote, laptop)).toEqual({ sent: 0, received: 1, removed: 0 });
    expect(await laptop.wines.get(id)).toMatchObject({ producer: 'Ridge' });
    expect(await (await laptop.photos.get(blobId))!.blob.arrayBuffer()).toEqual(await photoBlob().arrayBuffer());

    // Nothing left to do on either side.
    expect(await syncOnce(cloud.remote, laptop)).toEqual({ sent: 0, received: 0, removed: 0 });
    expect(await syncOnce(cloud.remote, phone)).toEqual({ sent: 0, received: 0, removed: 0 });
  });

  it('merges collections that started on different devices', async () => {
    await createWine({ ...emptyDraft(), producer: 'On phone' }, phone);
    await createWine({ ...emptyDraft(), producer: 'On laptop' }, laptop);
    await syncOnce(cloud.remote, phone);
    await syncOnce(cloud.remote, laptop);
    await syncOnce(cloud.remote, phone);
    const names = async (d: PalateDB) => (await d.wines.toArray()).map((w) => w.producer).sort();
    expect(await names(phone)).toEqual(['On laptop', 'On phone']);
    expect(await names(laptop)).toEqual(['On laptop', 'On phone']);
  });

  it('keeps the later edit when both devices changed the same wine', async () => {
    const id = await createWine({ ...emptyDraft(), producer: 'Ridge' }, phone);
    await syncOnce(cloud.remote, phone);
    await syncOnce(cloud.remote, laptop);

    await updateWine(id, { rating: 'liked' }, laptop);
    await tick();
    await updateWine(id, { rating: 'loved' }, phone);
    await syncOnce(cloud.remote, laptop);
    await syncOnce(cloud.remote, phone);
    await syncOnce(cloud.remote, laptop);
    expect((await phone.wines.get(id))!.rating).toBe('loved');
    expect((await laptop.wines.get(id))!.rating).toBe('loved');
  });

  it('removes a deleted wine on the other device too', async () => {
    const blobId = await savePhoto(photoBlob(), 1, 1, phone);
    const id = await createWine({ ...emptyDraft(), producer: 'Gone', photo: { kind: 'local', blobId } }, phone);
    await syncOnce(cloud.remote, phone);
    await syncOnce(cloud.remote, laptop);
    expect(await laptop.wines.count()).toBe(1);

    await tick();
    await deleteWine(id, phone);
    expect(await syncOnce(cloud.remote, phone)).toMatchObject({ sent: 1 });
    expect(await phone.deletions.count()).toBe(0);
    expect(cloud.rows.get(id)!.deleted).toBe(true);

    expect(await syncOnce(cloud.remote, laptop)).toMatchObject({ removed: 1 });
    expect(await laptop.wines.count()).toBe(0);
    expect(await laptop.photos.count()).toBe(0);
    // A deleted wine doesn't come back.
    expect(await syncOnce(cloud.remote, phone)).toEqual({ sent: 0, received: 0, removed: 0 });
    expect(await phone.wines.count()).toBe(0);
  });

  it('keeps a wine edited elsewhere after it was deleted here', async () => {
    const id = await createWine({ ...emptyDraft(), producer: 'Ridge' }, phone);
    await syncOnce(cloud.remote, phone);
    await syncOnce(cloud.remote, laptop);
    await deleteWine(id, phone);
    await tick();
    await updateWine(id, { rating: 'loved' }, laptop);
    await syncOnce(cloud.remote, laptop);
    await syncOnce(cloud.remote, phone);
    expect((await phone.wines.get(id))!.rating).toBe('loved');
    expect(await phone.deletions.count()).toBe(0);
  });

  it('doesn’t delete a never-synced wine’s record online twice', async () => {
    const id = await createWine({ ...emptyDraft(), producer: 'Brief' }, phone);
    await deleteWine(id, phone);
    expect(await syncOnce(cloud.remote, phone)).toEqual({ sent: 0, received: 0, removed: 0 });
    expect(cloud.rows.size).toBe(0);
    expect(await phone.deletions.count()).toBe(0);
  });

  it('uploads each photo only once', async () => {
    const blobId = await savePhoto(photoBlob(), 1, 1, phone);
    const id = await createWine({ ...emptyDraft(), photo: { kind: 'local', blobId } }, phone);
    let uploads = 0;
    const counting: Remote = { ...cloud.remote, uploadPhoto: async (i, b) => (uploads++, cloud.remote.uploadPhoto(i, b)) };
    await syncOnce(counting, phone);
    await tick();
    await updateWine(id, { notes: 'more' }, phone);
    await syncOnce(counting, phone);
    expect(uploads).toBe(1);
  });

  it('still saves a wine whose photo never made it online', async () => {
    const blobId = await savePhoto(photoBlob(), 1, 1, phone);
    await createWine({ ...emptyDraft(), producer: 'Ridge', photo: { kind: 'local', blobId } }, phone);
    await syncOnce(cloud.remote, phone);
    cloud.photos.clear();
    await syncOnce(cloud.remote, laptop);
    expect(await laptop.wines.count()).toBe(1);
    expect(await laptop.photos.count()).toBe(0);
  });
});
