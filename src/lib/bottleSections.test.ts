import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../db';
import type { Wine } from '../types';
import { grapeCard, regionCard, structureOf } from './bottleSections';
import { votedGrapes } from './catalogFacts';
import { abvFrom } from './labelReader';
import { glassFor } from './glass';
import type { PalateProfile } from './profile';
import { buildTaste } from './taste';

let n = 0;
const wine = (over: Partial<Wine>): Wine => ({ ...emptyDraft(), id: `w${n++}`, createdAt: n, updatedAt: n, ...over });

const profile: PalateProfile = {
  importedAt: 0,
  asOf: '',
  owner: '',
  summary: '',
  preferences: [
    { key: 'tannin', dimension: 'tannin', value: 'Firm/grippy, balanced with fruit', confidence: 'high' },
    { key: 'white_style', dimension: 'white style', value: 'Crisp, saline; prefers these over oaky whites', confidence: 'high' },
    { key: 'fruit', dimension: 'fruit', value: 'Some fruit; avoid excessive sweetness', confidence: 'high' },
  ],
  inferences: [],
  notSupported: [],
  pairing: [],
  budget: null,
  feedback: [],
  suggestedBefore: [],
};

const barolo = wine({ producer: 'Renato Ratti', name: 'Barolo Marcenasco', region: 'Barolo', country: 'Italy', style: 'red', grapes: ['Nebbiolo'] });

describe('Structure', () => {
  it('shows a Barolo as full, tannic, high-acid and dry, in a garnet Burgundy glass, matching a taste for grip', () => {
    const s = structureOf(barolo, profile)!;
    expect(s.line).toBe('Red · typical for Nebbiolo');
    expect(s.rows.map((r) => `${r.label} ${r.value} ${r.level}`)).toEqual(['Body Full 4', 'Tannin High 5', 'Acidity High 5', 'Sweetness Dry 1']);
    expect(s.glass.shape).toBe('burgundy');
    expect(s.glass.fill[0]).toBe('#9a3a2e');
    expect(s.matches).toBe(true);
    expect(s.fit).toBe('Firm, gripping tannin with bright acidity: right in your style.');
  });

  it('uses the place’s usual grapes when none are named, and hides tannin for whites', () => {
    const cdp = structureOf(wine({ name: 'Châteauneuf-du-Pape', style: 'red' }), null)!;
    expect(cdp.line).toBe('Red · typical for a Grenache blend');
    expect(cdp.fit).toBe('');
    const albarino = structureOf(wine({ name: 'Rías Baixas', style: 'white', grapes: ['Albariño'] }), profile)!;
    expect(albarino.rows.map((r) => r.label)).not.toContain('Tannin');
    expect(albarino.fit).toBe('Crisp and bright: the kind of white you prefer.');
    const chablis = structureOf(wine({ name: 'Chablis Premier Cru', style: 'white', grapes: ['Chardonnay'] }), profile)!;
    expect(chablis.rows.map((r) => r.value)).toEqual(['Light', 'High', 'Dry']);
    expect(chablis.glass.shape).toBe('crispWhite');
  });

  it('says when a red is softer than you usually like, and is left out when no grape is known', () => {
    expect(structureOf(wine({ style: 'red', grapes: ['Gamay'] }), profile)!.fit).toBe('Softer tannin than the reds you usually go for.');
    expect(structureOf(wine({ style: 'red', name: 'House Red' }), profile)).toBeNull();
  });
});

describe('Glass', () => {
  it('picks the glass from style and grape', () => {
    expect(glassFor('red', ['Cabernet Sauvignon']).shape).toBe('bordeaux');
    expect(glassFor('red', ['Pinot Noir']).shape).toBe('burgundy');
    expect(glassFor('white', ['Chardonnay']).shape).toBe('fullWhite');
    expect(glassFor('white', ['Chardonnay'], 'Chablis Premier Cru').shape).toBe('crispWhite');
    expect(glassFor('white', ['Sauvignon Blanc']).shape).toBe('crispWhite');
    expect(glassFor('sparkling', ['Chardonnay']).shape).toBe('sparkling');
    expect(glassFor('fortified', ['Touriga Nacional']).shape).toBe('dessert');
    expect(glassFor('rose', []).shape).toBe('rose');
  });
});

describe('Grapes and Region', () => {
  const loved = [
    wine({ producer: 'A', region: 'Barolo', style: 'red', grapes: ['Nebbiolo'], rating: 'loved' }),
    wine({ producer: 'B', region: 'Barolo', style: 'red', grapes: ['Nebbiolo'], rating: 'loved' }),
    wine({ producer: 'C', region: 'Barbaresco', style: 'red', grapes: ['Nebbiolo'], rating: 'loved' }),
    wine({ producer: 'D', region: 'Rioja', style: 'red', grapes: ['Tempranillo'], rating: 'liked' }),
    wine({ producer: 'E', region: 'Rioja', style: 'red', grapes: ['Tempranillo'], rating: 'wouldnt' }),
  ];

  it('shows all the grapes on one card, with the lead grape’s line and the one you loved most', () => {
    const g = grapeCard(barolo, loved)!;
    expect(g).toMatchObject({ names: ['Nebbiolo'], more: 0, share: '100%', loved: { grape: 'Nebbiolo', n: 3 } });
    expect(g.taste).toContain('roses, tar');
    const blend = grapeCard(wine({ grapes: ['Cabernet Sauvignon', 'Merlot', 'Cabernet Franc', 'Petit Verdot', 'Malbec'] }), loved)!;
    expect(blend).toMatchObject({ names: ['Cabernet Sauvignon', 'Merlot', 'Cabernet Franc'], more: 2, share: '', loved: null });
    expect(blend.taste).toMatch(/^Cabernet Sauvignon leads: blackcurrant/);
    expect(grapeCard(wine({ name: 'Gigondas' }), [])!.share).toBe('Usually');
  });

  it('uses the catalog’s grapes when the wine has none, before the place’s usual ones', () => {
    const facts = { grapes: ['Tempranillo', 'Garnacha'], subregion: '' };
    const w = wine({ producer: 'X', name: 'Rioja Reserva', region: 'Rioja', style: 'red' });
    expect(grapeCard(w, [], facts)).toMatchObject({ names: ['Tempranillo', 'Grenache'], share: '' });
    expect(structureOf(w, null, facts)!.line).toBe('Red · typical for a Tempranillo blend');
    expect(structureOf({ ...w, abv: 14.5 }, null, facts)!.line).toBe('Red · 14.5% ABV · typical for a Tempranillo blend');
    expect(grapeCard(w, [], facts)!.taste).toMatch(/^Tempranillo: cherry/);
    // Shops' names for grapes, and the grape most of them list first.
    expect(
      votedGrapes([
        { grapes: ['Carignan', 'Mourvedre', 'Crljenak kaštelanski', 'Durif', 'Region'], source_count: 13 },
        { grapes: ['Crljenak kaštelanski', 'Durif'], source_count: 2 },
        { grapes: ['Crljenak kaštelanski'], source_count: 1 },
      ]),
    ).toEqual(['Zinfandel', 'Petite Sirah', 'Carignan', 'Mourvèdre']);
  });

  it('reads the alcohol from the label as a number', () => {
    expect(abvFrom('14.5')).toBe(14.5);
    expect(abvFrom('13,5 % vol')).toBe(13.5);
    expect(abvFrom('')).toBeNull();
    expect(abvFrom('750')).toBeNull();
  });

  it('describes the place and what it means for you', () => {
    const r = regionCard(barolo, loved, buildTaste(loved))!;
    expect(r).toMatchObject({ name: 'Barolo', area: 'Piedmont', sub: 'Italy', knownFor: expect.stringContaining('Nebbiolo') });
    // The catalog's sub-region shows when it adds something.
    expect(regionCard(barolo, [], null, { grapes: [], subregion: 'Barolo' })!.sub).toBe('Italy');
    const sonoma = wine({ region: 'Sonoma Coast', country: 'United States', name: 'Pinot Noir' });
    expect(regionCard(sonoma, [], null, { grapes: [], subregion: 'Russian River Valley' })?.sub).toBe('Russian River Valley · United States');
    expect(r.forYou).toMatch(/2 loved|loved 2/);
    expect(regionCard(wine({ region: 'Somewhere new' }), [], null)).toBeNull();
  });
});
