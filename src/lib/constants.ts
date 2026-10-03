import type { Rating, WineStyle } from '../types';

export const RATINGS: { value: Rating; label: string; short: string }[] = [
  { value: 'loved', label: 'Loved it', short: 'Loved' },
  { value: 'liked', label: 'Liked it', short: 'Liked' },
  { value: 'wouldnt', label: 'Wouldn’t buy again', short: 'Wouldn’t buy' },
];

export const RATING_LABEL: Record<Rating, string> = {
  loved: 'Loved it',
  liked: 'Liked it',
  wouldnt: 'Wouldn’t buy again',
};

export const STYLES: { value: WineStyle; label: string }[] = [
  { value: 'red', label: 'Red' },
  { value: 'white', label: 'White' },
  { value: 'rose', label: 'Rosé' },
  { value: 'sparkling', label: 'Sparkling' },
  { value: 'orange', label: 'Orange' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'fortified', label: 'Fortified' },
];

export const STYLE_LABEL: Record<WineStyle, string> = Object.fromEntries(
  STYLES.map((s) => [s.value, s.label]),
) as Record<WineStyle, string>;

export interface PriceBand {
  id: string;
  label: string;
  min: number;
  /** Exclusive upper bound; Infinity for open-ended. */
  max: number;
}

export const PRICE_BANDS: PriceBand[] = [
  { id: 'u20', label: 'Under $20', min: 0, max: 20 },
  { id: '20-40', label: '$20–40', min: 20, max: 40 },
  { id: '40-75', label: '$40–75', min: 40, max: 75 },
  { id: '75+', label: '$75+', min: 75, max: Infinity },
];

export const COMMON_COUNTRIES = [
  'Argentina', 'Australia', 'Austria', 'Chile', 'France', 'Germany', 'Greece',
  'Hungary', 'Israel', 'Italy', 'Lebanon', 'New Zealand', 'Portugal',
  'South Africa', 'Spain', 'Switzerland', 'United States', 'Uruguay',
];

export const COMMON_GRAPES = [
  'Albariño', 'Barbera', 'Cabernet Franc', 'Cabernet Sauvignon', 'Carménère',
  'Chardonnay', 'Chenin Blanc', 'Gamay', 'Garnacha', 'Gewürztraminer',
  'Grenache', 'Grüner Veltliner', 'Malbec', 'Merlot', 'Mourvèdre', 'Nebbiolo',
  'Pinot Grigio', 'Pinot Gris', 'Pinot Meunier', 'Pinot Noir', 'Riesling',
  'Sangiovese', 'Sauvignon Blanc', 'Sémillon', 'Syrah', 'Shiraz',
  'Tempranillo', 'Touriga Nacional', 'Viognier', 'Zinfandel',
];
