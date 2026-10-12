import type { WineStyle } from '../types';
import { guideName } from './grapeGuide';

/**
 * Which glass a wine is drawn in on its page, and the colour it's filled with. Seven shapes:
 * the Burgundy bowl for Pinot, Nebbiolo and Gamay; the Bordeaux glass for other reds; a full or
 * a crisp white; rosé; a flute for sparkling; a small glass for sweet and fortified wines.
 */

export type GlassShape = 'burgundy' | 'bordeaux' | 'fullWhite' | 'crispWhite' | 'rose' | 'sparkling' | 'dessert';

export interface Glass {
  shape: GlassShape;
  /** The wine's colour, top-left to bottom-right. */
  fill: [string, string];
}

const BURGUNDY = new Set(['Pinot Noir', 'Nebbiolo', 'Gamay']);
const FULL_WHITE = new Set(['Chardonnay', 'Viognier', 'Marsanne', 'Roussanne', 'Grenache Blanc', 'Sémillon', 'Gewürztraminer']);
/** Places whose Chardonnay is unoaked and crisp. */
export const CRISP_PLACES = /\b(chablis|petit chablis|unoaked|m[aâ]con)\b/i;

const COLOURS: Record<GlassShape, [string, string]> = {
  burgundy: ['#a33447', '#5e1222'],
  bordeaux: ['#6e1a2c', '#33070f'],
  fullWhite: ['#f0d27a', '#cfa443'],
  crispWhite: ['#f3e6a6', '#dcc771'],
  rose: ['#f6b8a8', '#e48b7b'],
  sparkling: ['#f4e7b2', '#e0cb7c'],
  dessert: ['#a3542a', '#5c2410'],
};
const GARNET: [string, string] = ['#9a3a2e', '#561812'];

export function glassFor(style: WineStyle | null, grapes: string[], placeText = ''): Glass {
  const first = grapes.map(guideName).find(Boolean) ?? null;
  const shape: GlassShape =
    style === 'rose'
      ? 'rose'
      : style === 'sparkling'
        ? 'sparkling'
        : style === 'dessert' || style === 'fortified'
          ? 'dessert'
          : style === 'white' || style === 'orange'
            ? first && FULL_WHITE.has(first) && !(first === 'Chardonnay' && CRISP_PLACES.test(placeText))
              ? 'fullWhite'
              : 'crispWhite'
            : first && BURGUNDY.has(first)
              ? 'burgundy'
              : 'bordeaux';
  return { shape, fill: shape === 'burgundy' && first === 'Nebbiolo' ? GARNET : COLOURS[shape] };
}
