import { describe, expect, it } from 'vitest';
import { createWine, emptyDraft, PalateDB } from '../db';
import type { DescribeRequest } from './coach';
import { mineLine, needsTake, writeTake } from './wineTake';

const TAKE = { whatItIs: 'A Barolo from a single vineyard.', taste: 'Roses, tar, firm tannin.', fit: 'Close to the one you loved.', serve: 'Decant an hour.', caveat: '' };

describe("Palate's take on a wine", () => {
  it('writes the description once, saves it with the wine, and tells Claude what you said about it', async () => {
    const database = new PalateDB(`take-${Math.random()}`);
    const id = await createWine({ ...emptyDraft(), producer: 'Cantina Inventata', name: 'Barolo Vigna Finta', vintage: 2019, rating: 'loved', owned: 2, notes: 'Rose petals, long.' }, database);
    const other = await createWine({ ...emptyDraft(), producer: 'Bodega Ficticia', name: 'Rioja Reserva', rating: 'liked' }, database);
    const wine = (await database.wines.get(id))!;
    const wines = await database.wines.toArray();
    expect(needsTake(wine)).toBe(true);

    const asked: DescribeRequest[] = [];
    const describe = async (req: DescribeRequest) => (asked.push(req), { ok: true as const, take: TAKE });
    // Opening the page twice at once still sends one request.
    const [a, b] = [writeTake(wine, wines, database, describe), writeTake(wine, wines, database, describe)];
    expect(a).toBe(b);
    await a;

    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ producer: 'Cantina Inventata', vintage: '2019', mine: 'I loved it; I have 2 bottles; my notes: "Rose petals, long.".' });
    expect(asked[0].context).toContain('Bodega Ficticia Rioja Reserva');
    const saved = (await database.wines.get(id))!;
    expect(saved.take).toMatchObject({ ...TAKE, rating: 'loved' });
    expect(needsTake(saved)).toBe(false);
    expect((await database.wines.get(other))!.take).toBeUndefined();
  });

  it('keeps nothing when Claude fails', async () => {
    const database = new PalateDB(`take-${Math.random()}`);
    const id = await createWine({ ...emptyDraft(), producer: 'X', name: 'Y' }, database);
    const wine = (await database.wines.get(id))!;
    const out = await writeTake(wine, [wine], database, async () => ({ ok: false as const, reason: 'no connection' }));
    expect(out).toEqual({ ok: false, reason: 'no connection' });
    expect((await database.wines.get(id))!.take).toBeUndefined();
  });

  it('skips wines dismissed as Not for me', () => {
    expect(needsTake({ ...emptyDraft(), producer: 'X', list: 'passed' } as never)).toBe(false);
    expect(mineLine({ ...emptyDraft(), list: 'want' } as never)).toBe('On my want-to-try list.');
  });
});
