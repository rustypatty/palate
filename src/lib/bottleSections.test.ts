import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../db';
import type { Wine } from '../types';
import { grapeCards, regionCard, structureOf } from './bottleSections';
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
    expect(cdp.line).toBe('Red · typical for Grenache and Syrah');
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

  it('gives each grape a line and how many of it you loved; blends stop at three', () => {
    const g = grapeCards(barolo, loved)!;
    expect(g.cards).toEqual([{ name: 'Nebbiolo', share: '100%', taste: expect.stringContaining('roses, tar'), loved: 3 }]);
    const blend = grapeCards(wine({ grapes: ['Cabernet Sauvignon', 'Merlot', 'Cabernet Franc', 'Petit Verdot', 'Malbec'] }), [])!;
    expect(blend.cards).toHaveLength(3);
    expect(blend.more).toBe(2);
    expect(blend.cards[0].share).toBe('');
    expect(grapeCards(wine({ name: 'Gigondas' }), [])!.cards[0].share).toBe('Usually');
  });

  it('describes the place and what it means for you', () => {
    const r = regionCard(barolo, loved, buildTaste(loved))!;
    expect(r).toMatchObject({ name: 'Barolo', area: 'Piedmont', country: 'Italy', knownFor: expect.stringContaining('Nebbiolo') });
    expect(r.forYou).toMatch(/2 loved|loved 2/);
    expect(regionCard(wine({ region: 'Somewhere new' }), [], null)).toBeNull();
  });
});
