import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../db';
import type { Wine } from '../types';
import { budgetLine, exploreCards, heroHeadline, heroSummary, loveChips, redsLine, skipsLine, usualPrice, whitesLine } from './palatePage';
import type { PalateProfile } from './profile';
import { buildTaste } from './taste';

let n = 0;
const wine = (over: Partial<Wine>): Wine => ({ ...emptyDraft(), id: `w${n++}`, createdAt: n, updatedAt: n, ...over });

const profile: PalateProfile = {
  importedAt: 0,
  asOf: '2026-01-01',
  owner: '',
  summary: 'Prefers bold, structured reds with firm tannins and ripe fruit; also enjoys Rioja. Whites tend toward crisp, saline styles, with Albariño often chosen.',
  preferences: [
    { key: 'red_benchmark', dimension: 'red benchmark', value: 'Brunello (Favorite red.)', confidence: 'high' },
    { key: 'tannin', dimension: 'tannin', value: 'Firm/grippy, balanced with fruit', confidence: 'high' },
    { key: 'fruit', dimension: 'fruit', value: 'Ripe dark fruit; avoid jammy styles', confidence: 'high' },
    { key: 'white_style', dimension: 'white style', value: 'Crisp, saline; prefers these over oaky whites', confidence: 'high' },
    { key: 'white_style_favorites', dimension: 'white style favorites', value: 'Albariño, Muscadet, Vermentino', confidence: 'high' },
  ],
  inferences: [
    { hypothesis: 'Tannin alone does not explain enjoyment; acidity matters.', confidence: 'moderate', limits: 'Small sample.' },
    { hypothesis: 'Northern Rhône Syrah deserves attention.', confidence: 'moderate', limits: 'Tasted once but unrated; do not use as positive feedback.' },
    { hypothesis: 'Lighter reds can work too; Etna Rosso is a confirmed direction.', confidence: 'high', limits: 'One bottle is not proof.' },
    { hypothesis: 'Old World reds are a strong starting point.', confidence: 'moderate', limits: 'Convenience sample shaped by prior recommendations.' },
  ],
  notSupported: [],
  pairing: [],
  budget: 80,
  feedback: [],
  suggestedBefore: [],
};

describe('My palate wording', () => {
  it('trims the imported summary to a short line under the headline', () => {
    const s = heroSummary(profile, null, false);
    expect(s).toBe('Bold, structured reds with firm tannins and ripe fruit. Whites tend toward crisp, saline styles.');
    expect(s.length).toBeLessThanOrEqual(120);
    // Too long for two lines: the first sentence only.
    const long = { ...profile, summary: `${profile.summary.split('.')[0]}. Whites lean toward crisp, saline, mineral, lightly aromatic coastal styles from Galicia, the Loire and Liguria.` };
    expect(heroSummary(long, null, false)).toBe('Bold, structured reds with firm tannins and ripe fruit.');
  });

  it('condenses tannin, fruit and whites into one sentence each', () => {
    expect(redsLine(profile)).toBe('Firm, grippy tannin with ripe dark fruit.');
    expect(whitesLine(profile)).toBe('Crisp, saline whites over oaky ones.');
    expect(redsLine(null)).toBe('');
  });

  it('says what your "Wouldn’t buy again" notes share', () => {
    const wines = [
      wine({ producer: 'A', rating: 'wouldnt', style: 'red', notes: 'Thin, no tannins at all.' }),
      wine({ producer: 'B', rating: 'wouldnt', style: 'red', notes: 'Too jammy and no tannin grip.' }),
      wine({ producer: 'C', rating: 'loved', style: 'red', notes: 'Earthy.' }),
      wine({ producer: 'D', rating: 'loved', style: 'red' }),
      wine({ producer: 'E', rating: 'liked', style: 'red' }),
    ];
    expect(skipsLine(buildTaste(wines), wines)).toBe('Thin, jammy reds with no tannin grip.');
  });

  it('gives the usual price as the middle half, ignoring one expensive bottle and restaurant prices', () => {
    const paid = (price: number, over: Partial<Wine> = {}) => wine({ producer: `P${price}`, price, ...over });
    const wines = [paid(39), paid(43), paid(45), paid(52), paid(249), paid(150, { rating: 'loved', notes: 'At a steakhouse (restaurant price).' }), paid(60, { rating: 'wouldnt' })];
    expect(usualPrice(wines)).toEqual({ low: 45, high: 50 });
    expect(budgetLine(wines, profile)).toBe('Usually $45–$50. Up to $80 for something special.');
    // Enough loved wines with prices: only those count.
    const loved = [paid(20, { rating: 'loved' }), paid(25, { rating: 'loved' }), paid(30, { rating: 'loved' }), paid(200)];
    expect(usualPrice(loved)).toEqual({ low: 25, high: 30 });
    expect(usualPrice([paid(40)])).toBeNull();
  });

  it('shows ideas worth exploring without the notes meant for Claude', () => {
    const cards = exploreCards(profile);
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.title)).toEqual(['Northern Rhône Syrah deserves attention', 'Lighter reds can work too', 'Old World reds are a strong starting point']);
    expect(cards[0].sub).toBe('From a bottle you tasted but haven’t rated');
    expect(cards[1].sub).toBe('Etna Rosso is a confirmed direction');
    const shown = JSON.stringify(cards);
    expect(shown).not.toMatch(/do not use|Convenience sample|not proof/);
  });

  it('lists favourites and well-rated places once, places before grapes, without the headline wine', () => {
    const wines = [
      wine({ producer: 'X', rating: 'loved', region: 'Rioja', grapes: ['Tempranillo'], style: 'red' }),
      wine({ producer: 'Y', rating: 'loved', region: 'Rioja', grapes: ['Tempranillo'], style: 'red' }),
      wine({ producer: 'Z', rating: 'loved', region: 'Brunello di Montalcino', grapes: ['Sangiovese'], style: 'red' }),
      wine({ producer: 'Q', rating: 'liked', region: 'Rías Baixas', grapes: ['Albariño'], style: 'white' }),
      wine({ producer: 'R', rating: 'liked', region: 'Muscadet', grapes: ['Melon de Bourgogne'], style: 'white' }),
    ];
    const chips = loveChips(profile, buildTaste(wines), [], 'Brunello');
    expect(chips).not.toContain('Brunello');
    expect(chips.filter((c) => c.toLowerCase() === 'albariño')).toHaveLength(1);
    const firstGrape = chips.findIndex((c) => ['Albariño', 'Vermentino', 'Tempranillo', 'Sangiovese'].includes(c));
    expect(firstGrape).toBeGreaterThan(0);
    expect(chips.slice(0, firstGrape)).toContain('Rioja');
    expect(chips.slice(firstGrape)).not.toContain('Rioja');
  });

  it('adds sweetness to Skips when the profile says to avoid it, and never counts a denied word', () => {
    const wines = [
      wine({ producer: 'A', rating: 'wouldnt', style: 'red', notes: 'Light body. No hint of fruit forward.' }),
      wine({ producer: 'B', rating: 'wouldnt', style: 'red', notes: 'No gripping tannins.' }),
      wine({ producer: 'C', rating: 'loved', style: 'red' }),
      wine({ producer: 'D', rating: 'loved', style: 'red' }),
      wine({ producer: 'E', rating: 'liked', style: 'red' }),
    ];
    const avoidsSweet = { ...profile, preferences: [...profile.preferences, { key: 'fruit', dimension: 'fruit', value: 'Some fruit; avoid excessive sweetness', confidence: 'high' }] };
    expect(skipsLine(buildTaste(wines), wines, avoidsSweet)).toBe('Sweet wines, and light reds with no tannin grip.');
    expect(skipsLine(buildTaste(wines), wines, null)).toBe('Light reds with no tannin grip.');
  });

  it('heads the page with your favourite and the places that follow it', () => {
    const wines = ['Rioja', 'Rioja', 'Mercurey', 'Volnay', 'Châteauneuf-du-Pape', 'Gigondas'].map((region, i) =>
      wine({ producer: `P${i}`, rating: 'loved', region, country: region === 'Rioja' ? 'Spain' : 'France', style: 'red' }),
    );
    const h = heroHeadline('Barolo', buildTaste(wines));
    expect(h?.text).toMatch(/^Barolo first, then /);
    expect(h?.em[0]).toBe('Barolo');
    expect(h?.em.length).toBeGreaterThan(2);
    expect(heroHeadline('Barolo', null)).toEqual({ text: 'Barolo is your favourite red.', em: ['Barolo'] });
    expect(heroHeadline('', buildTaste(wines))).toBeNull();
  });
});
