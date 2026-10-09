import { describe, expect, it } from 'vitest';
import { createWine, emptyDraft, PalateDB } from '../db';
import { wine } from '../test/fixtures';
import { cellarLinks, LESSON_VERSION, lessonRequest, needsLesson, writeLesson, type LessonRequest } from './learn';

const cdp = wine({ id: 'cdp', producer: 'Domaine Essai', name: 'Châteauneuf-du-Pape', region: 'Châteauneuf-du-Pape', grapes: ['Grenache', 'Syrah'], style: 'red', rating: 'loved' });
const cdp2 = wine({ id: 'cdp2', producer: 'Clos Exemple', name: 'Châteauneuf-du-Pape Vieilles Vignes', region: 'Châteauneuf-du-Pape', grapes: ['Grenache'], style: 'red' });
const gigondas = wine({ id: 'gig', producer: 'Domaine Test', name: 'Gigondas', region: 'Gigondas', grapes: ['Grenache', 'Syrah'], style: 'red', rating: 'liked' });
const garnacha = wine({ id: 'garn', producer: 'Bodega Prueba', name: 'Old Vine', region: 'Calatayud', country: 'Spain', grapes: ['Garnacha'], style: 'red' });
const crozes = wine({ id: 'crozes', producer: 'Maison Probe', name: 'Crozes-Hermitage', region: 'Crozes-Hermitage', grapes: ['Syrah'], style: 'red' });
const passed = wine({ id: 'passed', producer: 'Nope', name: 'Châteauneuf-du-Pape', region: 'Châteauneuf-du-Pape', grapes: ['Grenache'], list: 'passed' });
const chablis = wine({ id: 'chablis', producer: 'Domaine Blanc', name: 'Chablis', region: 'Chablis', grapes: ['Chardonnay'], style: 'white' });

const cellar = [cdp, cdp2, gigondas, garnacha, crozes, passed, chablis];

describe('your cellar, connected', () => {
  it('shows the same appellation, then the same area, then the same grapes, each bottle once', () => {
    const links = cellarLinks(cdp, cellar);
    expect(links.map((l) => [l.label, l.wines.map((w) => w.id)])).toEqual([
      ['Also from Châteauneuf-du-Pape', ['cdp2']],
      ['Elsewhere in Southern Rhône', ['gig']],
      // Garnacha is Grenache under its Spanish name.
      ['Also Grenache', ['garn']],
      ['Also Syrah', ['crozes']],
    ]);
  });

  it('leaves out Not for me bottles and the wine itself', () => {
    const ids = cellarLinks(cdp, cellar).flatMap((l) => l.wines.map((w) => w.id));
    expect(ids).not.toContain('passed');
    expect(ids).not.toContain('cdp');
  });

  it('falls back to the region as written when it is not a known appellation', () => {
    const a = wine({ id: 'a', producer: 'A', name: 'Red', region: 'Texas Hill Country', grapes: ['Tempranillo'] });
    const b = wine({ id: 'b', producer: 'B', name: 'Blend', region: 'texas hill country' });
    expect(cellarLinks(a, [a, b])).toEqual([{ kind: 'place', label: 'Also from Texas Hill Country', wines: [b] }]);
  });

  it('is empty when nothing is shared', () => {
    expect(cellarLinks(chablis, cellar)).toEqual([]);
  });

  it('tells Claude which related bottles you loved, to compare with', () => {
    expect(lessonRequest(cdp2, cellar).related).toEqual(['Domaine Essai Châteauneuf-du-Pape (I loved it)', 'Domaine Test Gigondas (I liked it)', 'Bodega Prueba Old Vine']);
  });
});

const LESSON = { grape: 'Grenache gives ripe red fruit.', place: 'Hot, stony vineyards.', making: 'Typically aged in large old casks.', tasteFor: 'Notice the warmth on the finish.' };

describe('writing the lesson', () => {
  it('writes once, saves it with the wine, and only for wines you have or want', async () => {
    const database = new PalateDB(`learn-${Math.random()}`);
    const id = await createWine({ ...emptyDraft(), producer: 'Domaine Essai', name: 'Châteauneuf-du-Pape', region: 'Châteauneuf-du-Pape', vintage: 2021 }, database);
    const w = (await database.wines.get(id))!;
    expect(needsLesson(w)).toBe(true);
    expect(needsLesson({ ...w, list: 'passed' })).toBe(false);

    const asked: LessonRequest[] = [];
    const write = async (req: LessonRequest) => (asked.push(req), { ok: true as const, lesson: LESSON });
    const [a, b] = [writeLesson(w, [w], database, write), writeLesson(w, [w], database, write)];
    expect(a).toBe(b);
    await a;

    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ producer: 'Domaine Essai', vintage: '2021', related: [] });
    const saved = (await database.wines.get(id))!;
    expect(saved.lesson).toMatchObject({ ...LESSON, v: LESSON_VERSION });
    expect(needsLesson(saved)).toBe(false);
  });

  it('rewrites a lesson from before the cards had headlines, once', () => {
    const old = { ...LESSON, writtenAt: 1 };
    const w = { id: 'x', producer: 'A', name: 'B', list: null } as unknown as Parameters<typeof needsLesson>[0];
    expect(needsLesson({ ...w, lesson: old })).toBe(true);
    expect(needsLesson({ ...w, lesson: { ...old, v: LESSON_VERSION } })).toBe(false);
  });

  it('keeps nothing when Claude fails', async () => {
    const database = new PalateDB(`learn-${Math.random()}`);
    const id = await createWine({ ...emptyDraft(), producer: 'X', name: 'Y' }, database);
    const w = (await database.wines.get(id))!;
    expect(await writeLesson(w, [w], database, async () => ({ ok: false as const, reason: 'no connection' }))).toEqual({ ok: false, reason: 'no connection' });
    expect((await database.wines.get(id))!.lesson).toBeUndefined();
  });
});
