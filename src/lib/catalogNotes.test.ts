import { describe, expect, it } from 'vitest';
import { createWine, emptyDraft, PalateDB } from '../db';
import { fillFromCatalog, noteFor, noteKey, type CatalogNote } from './catalogNotes';

const note = (key: string, vintage: number | null, taste: string, wineId: string | null = null): CatalogNote => ({ name_key: key, wine_id: wineId, vintage, what_it_is: 'What.', taste, serve: 'Serve.', caveat: '' });

describe('descriptions from the catalog', () => {
  it('gives the same key however the producer and name are written', () => {
    const k = noteKey('López de Heredia', 'Viña Bosconia Reserva');
    expect(noteKey('R. López de Heredia', 'Viña Bosconia Reserva')).toBe(k);
    expect(noteKey('', 'Lopez de Heredia Vina Bosconia Reserva')).toBe(k);
    expect(noteKey('Château Exemple', 'Pauillac')).toBe(noteKey('Chateau Exemple Pauillac', ''));
    expect(noteKey('Domaine Exemple', 'Mercurey 1er Cru')).toBe(noteKey('Exemple', 'Mercurey Premier Cru'));
    expect(noteKey('Château Exemple', 'Pauillac')).not.toBe(noteKey('Château Exemple', 'Margaux'));
  });

  it("prefers the wine's own vintage, then one written for any vintage", () => {
    const k = noteKey('Cantina Inventata', 'Barolo');
    const notes = [note(k, 2019, 'The 2019.'), note(k, null, 'Any year.'), note(k, 2018, 'The 2018.')];
    expect(noteFor({ producer: 'Cantina Inventata', name: 'Barolo', vintage: 2019 }, notes)?.taste).toBe('The 2019.');
    expect(noteFor({ producer: 'Cantina Inventata', name: 'Barolo', vintage: 2020 }, notes)?.taste).toBe('Any year.');
    expect(noteFor({ producer: 'Cantina Inventata', name: 'Barolo', vintage: 2020 }, [note(k, 2018, 'x')])).toBeNull();
  });

  it('fills every wine without a description in one request, and leaves the rest alone', async () => {
    const database = new PalateDB(`notes-${Math.random()}`);
    const a = await createWine({ ...emptyDraft(), producer: 'Cantina Inventata', name: 'Barolo', vintage: 2019, rating: 'loved' }, database);
    const b = await createWine({ ...emptyDraft(), producer: 'Bodega Ficticia', name: 'Rioja', take: { whatItIs: '', taste: 'Mine already.', fit: 'x', serve: '', caveat: '', writtenAt: 1, rating: null } }, database);
    const c = await createWine({ ...emptyDraft(), producer: 'Unknown', name: 'Wine' }, database);
    const asked: string[][] = [];
    const fetcher = async (keys: string[]) => (asked.push(keys), [note(noteKey('Cantina Inventata', 'Barolo'), 2019, 'Roses and tar.')]);
    expect(await fillFromCatalog(await database.wines.toArray(), database, fetcher, async () => null)).toBe(1);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toHaveLength(2); // the described wine isn't asked about
    expect((await database.wines.get(a))!.take).toMatchObject({ taste: 'Roses and tar.', fit: '', source: 'catalog', rating: 'loved' });
    expect((await database.wines.get(b))!.take?.taste).toBe('Mine already.');
    expect((await database.wines.get(c))!.take).toBeUndefined();
  });
});

it('finds a note by catalog id when the name is written differently', async () => {
  const database = new PalateDB(`notes-${Math.random()}`);
  const a = await createWine({ ...emptyDraft(), producer: 'Cantina Inventata', name: 'Barolo DOCG' }, database);
  const b = await createWine({ ...emptyDraft(), producer: 'Nobody', name: 'Nothing' }, database);
  const identified: string[] = [];
  const identify = async (p: string) => (identified.push(p), p === 'Cantina Inventata' ? 'wn_1' : null);
  const byId = async (ids: string[]) => (ids.includes('wn_1') ? [note('cantina inventata barolo', null, 'By id.', 'wn_1')] : []);
  expect(await fillFromCatalog(await database.wines.toArray(), database, async () => [], identify, byId)).toBe(1);
  expect((await database.wines.get(a))!.take?.taste).toBe('By id.');
  expect((await database.wines.get(b))!.take).toBeUndefined();
  // Not found: not asked again for a few days.
  identified.length = 0;
  await fillFromCatalog(await database.wines.toArray(), database, async () => [], identify, byId);
  expect(identified).toEqual([]);
});
