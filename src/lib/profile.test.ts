import { describe, expect, it } from 'vitest';
import { createWine, emptyDraft, PalateDB } from '../db';
import { splitProducer } from './catalog';
import { loadProfile, planImport, profileContext, profileFavourites, shownPreferences } from './profile';
import { checkedGrapes, existingFor, guideSplit, runImport } from './profileImport';

// A made-up history in the same shape as an exported profile file.
const SAMPLE = JSON.stringify({
  schema_version: '2.0',
  owner: 'Sam',
  created_at: '2026-10-07',
  profile: {
    owner: 'Sam',
    as_of: '2026-10-07',
    summary: 'Likes structured reds with enough fruit.',
    explicit_preferences: [
      { dimension: 'tannin', value: 'Noticeable, balanced with fruit', confidence: 'high' },
      { dimension: 'budget', value: 60, rule: 'Never recommend above $60 unless asked.', confidence: 'high' },
    ],
    inferences: [{ hypothesis: 'Northern Rhône is promising.', confidence: 'moderate', limits: 'One bottle.' }],
    not_supported: ['Dislikes all Merlot'],
    pairing_feedback: [{ wine_style: 'Sancerre', food: 'pesto pasta', reaction: 'not a great pairing', notes: '' }],
  },
  wines: [
    { id: 'w1', wine: 'Domaine Exemple Saint-Joseph Les Granits', vintage: 2021, status: 'loved', identity_status: 'confirmed', user_notes: 'Peppery, great.', events: [{ type: 'tasting_feedback', date: '2026-09-01' }] },
    { id: 'w2', wine: 'Bodega Ficticia Rioja Reserva', vintage: 2018, status: 'really_liked', identity_status: 'confirmed', user_notes: 'Soft but long.' },
    { id: 'w3', wine: 'Unidentified red from June', vintage: null, status: 'disliked', identity_status: 'needs_label_confirmation', user_notes: 'Very dry, little fruit.', candidate_identity: { wine: 'Quinta Talvez', vintage: 2020 } },
    { id: 'w4', wine: 'Cantina Inventata Barolo', vintage: 2019, status: 'purchased_untasted', identity_status: 'confirmed', user_notes: null },
    { id: 'w5', wine: 'Weingut Beispiel Riesling Kabinett', vintage: 2022, status: 'interested', identity_status: 'retrieved_identity' },
    { id: 'w6', wine: 'Château Imaginaire Pauillac', vintage: 2019, status: 'recommended', identity_status: 'retrieved_identity' },
    { id: 'w7', wine: 'Old Teroldego', vintage: 2022, status: 'disliked', identity_status: 'retrieved_identity', user_notes: 'Too austere.' },
    { id: 'w8', wine: 'Maybe Fontodi', vintage: 2021, status: 'purchase_reported', identity_status: 'retrieved_identity' },
  ],
});

describe('importing a wine profile', () => {
  it('turns tasted, bought and wanted bottles into wines, and keeps the rest as profile notes', () => {
    const { profile, items } = planImport(SAMPLE, 1);
    expect(items.map((i) => `${i.kind}:${i.rating ?? '-'}:${i.name}`)).toEqual([
      'rated:loved:Domaine Exemple Saint-Joseph Les Granits',
      'rated:liked:Bodega Ficticia Rioja Reserva',
      'owned:-:Cantina Inventata Barolo',
      'want:-:Weingut Beispiel Riesling Kabinett',
      'rated:wouldnt:Old Teroldego',
    ]);
    expect(items[1].notes).toBe('Really liked it. Soft but long.');
    expect(items[0].tastedOn).toBe('2026-09-01');
    // The unidentified bottle's words matter, but it isn't a wine you could look up.
    expect(profile.feedback).toEqual([{ wine: 'Unidentified red from June', reaction: 'disliked', notes: 'Very dry, little fruit.', candidate: 'Quinta Talvez 2020' }]);
    expect(profile.suggestedBefore).toEqual(['Château Imaginaire Pauillac 2019']);
    expect(profile.budget).toBe(60);
  });

  it('tells Claude the profile, the rules and what not to assume', () => {
    const text = profileContext(planImport(SAMPLE).profile);
    expect(text).toContain('Likes structured reds with enough fruit.');
    expect(text).toContain('tannin: Noticeable, balanced with fruit');
    expect(text).toContain('"Very dry, little fruit." [possibly Quinta Talvez 2020, unconfirmed]');
    expect(text).toContain("Don't assume any of these about me:\n- Dislikes all Merlot");
    expect(text).toContain('stay at or under $60 a bottle');
    expect(profileContext(null)).toBe('');
  });

  it('rejects files that are not a profile', () => {
    expect(() => planImport('not json')).toThrow(/valid JSON/);
    expect(() => planImport('{"wines": []}')).toThrow(/doesn’t look like a wine profile/);
  });

  it('splits the producer off where the catalog says it ends, keeping the spelling', () => {
    expect(splitProducer('Château Haut-Bages Libéral Pauillac', 'Chateau Haut-Bages Liberal')).toEqual({ producer: 'Château Haut-Bages Libéral', name: 'Pauillac' });
    expect(splitProducer('Renato Ratti Barolo Marcenasco', 'Renato Ratti')).toEqual({ producer: 'Renato Ratti', name: 'Barolo Marcenasco' });
    expect(splitProducer('Macán Clásico', 'Benjamin de Rothschild & Vega Sicilia')).toBeNull();
  });

  it('adds the wines with catalog details, leaves wines already in Palate alone, and saves the profile', async () => {
    const database = new PalateDB(`import-${Math.random()}`);
    await createWine({ ...emptyDraft(), producer: 'Bodega Ficticia', name: 'Rioja Reserva', vintage: 2018, rating: 'loved', notes: 'Mine.' }, database);
    const plan = planImport(SAMPLE, 5);
    const identify = async (name: string) =>
      name.startsWith('Domaine Exemple')
        ? { producer: 'Domaine Exemple', name: 'Saint-Joseph Les Granits', details: { photo: { url: 'https://img/x.jpg', pageUrl: 'https://shop/x', siteName: 'shop' }, style: 'red' as const, grapes: ['Syrah'], region: 'Northern Rhône', country: 'France' } }
        : null;
    const out = await runImport(plan, undefined, database, identify);
    expect(out).toEqual({ added: 4, alreadyThere: ['Bodega Ficticia Rioja Reserva 2018'] });
    const all = await database.wines.toArray();
    const sj = all.find((w) => w.producer === 'Domaine Exemple')!;
    expect(sj).toMatchObject({ name: 'Saint-Joseph Les Granits', rating: 'loved', grapes: ['Syrah'], style: 'red', owned: 0, notes: 'Peppery, great.' });
    expect(sj.photo).toMatchObject({ kind: 'remote', url: 'https://img/x.jpg' });
    // Not in the catalog: the appellation guide splits the name and fills what it is sure of.
    expect(all.find((w) => w.producer === 'Cantina Inventata')).toMatchObject({ name: 'Barolo', owned: 1, rating: null, region: 'Barolo', country: 'Italy', grapes: ['Nebbiolo'], style: 'red' });
    expect(all.find((w) => w.producer === 'Weingut Beispiel')).toMatchObject({ name: 'Riesling Kabinett', list: 'want', grapes: ['Riesling'] });
    expect(all.find((w) => w.producer === 'Bodega Ficticia')?.notes).toBe('Mine.'); // untouched
    expect(existingFor({ name: 'Bodega Ficticia Rioja Reserva', vintage: 2018 }, all)).toBeTruthy();
    expect(loadProfile()?.summary).toBe('Likes structured reds with enough fruit.');
  });
});

describe('the appellation guide fills in what the catalog does not know', () => {
  it('splits the producer at the first appellation or grape', () => {
    expect(guideSplit('Domaine Exemple Saint-Joseph Les Granits')).toEqual({ producer: 'Domaine Exemple', name: 'Saint-Joseph Les Granits' });
    expect(guideSplit('Maison Fictive Crozes-Hermitage')).toEqual({ producer: 'Maison Fictive', name: 'Crozes-Hermitage' });
    expect(guideSplit('Weingut Beispiel Riesling Kabinett')).toEqual({ producer: 'Weingut Beispiel', name: 'Riesling Kabinett' });
    expect(guideSplit('Something Unknown Red')).toBeNull();
  });

  it('corrects catalog grapes that contradict the appellation', () => {
    expect(checkedGrapes('Maison Fictive Pouilly-Fuissé', ['Pinot noir'])).toEqual(['Chardonnay']);
    expect(checkedGrapes('Maison Fictive Pouilly-Fuissé', ['Chardonnay'])).toEqual(['Chardonnay']);
    expect(checkedGrapes('Cantina Inventata Barolo', [])).toEqual(['Nebbiolo']);
    // Several grapes allowed: the guide only says "usually", so nothing is filled in.
    expect(checkedGrapes('Domaine Exemple Châteauneuf-du-Pape', [])).toEqual([]);
    expect(checkedGrapes('Domaine Exemple Châteauneuf-du-Pape', ['Grenache', 'Syrah'])).toEqual(['Grenache', 'Syrah']);
  });
});

it('uses one spelling per grape from the catalog', () => {
  expect(checkedGrapes('Domaine Exemple Rasteau', ['Garnacha Tinta', 'Syrah', 'Mourvedre'])).toEqual(['Grenache', 'Syrah', 'Mourvèdre']);
});

it('shows preferences in plain words and pulls out favourites', () => {
  const file = JSON.parse(SAMPLE);
  file.profile.explicit_preferences.push(
    { dimension: 'red_benchmark', value: 'Barolo', notes: 'Favourite red.', confidence: 'high' },
    { dimension: 'white_style_favorites', value: ['Sancerre', 'Riesling'], confidence: 'high' },
    { dimension: 'wine_identity', value: 'Exact producer and vintage', confidence: 'high' },
  );
  const p = planImport(JSON.stringify(file)).profile;
  expect(profileFavourites(p)).toEqual(['Barolo', 'Sancerre', 'Riesling']);
  const shown = shownPreferences(p);
  expect(shown.find((x) => x.label === 'Favourite red')?.value).toBe('Barolo');
  expect(shown.map((x) => x.label)).not.toContain('Wine identity');
});

describe('profile kept with your account', () => {
  it('remembers a removal on this device so the account copy goes too, and forgets it on the next import', async () => {
    const { saveProfile, profileClearedAt, forgetProfileClear } = await import('./profile');
    saveProfile(null);
    expect(profileClearedAt()).toBeGreaterThan(0);
    forgetProfileClear();
    expect(profileClearedAt()).toBeNull();
    saveProfile(null, { fromServer: true });
    expect(profileClearedAt()).toBeNull();
  });
});
