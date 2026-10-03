import { describe, expect, it } from 'vitest';
import { readingToDraft, readingToQuery, type LabelReading } from './labelReader';

const base: LabelReading = {
  is_wine_label: true,
  producer: 'Ridge',
  wine_name: 'Lytton Springs',
  vintage: '2021',
  country: 'United States',
  region: 'Dry Creek Valley',
  grapes: ['Zinfandel', ' Petite Sirah '],
  style: 'red',
  confidence: 'high',
  uncertain: '',
};

describe('label readings', () => {
  it('maps to add-form fields', () => {
    expect(readingToDraft(base)).toEqual({
      producer: 'Ridge',
      name: 'Lytton Springs',
      vintage: 2021,
      country: 'United States',
      region: 'Dry Creek Valley',
      grapes: ['Zinfandel', 'Petite Sirah'],
      style: 'red',
    });
  });

  it('handles NV, unreadable vintages and unknown style', () => {
    expect(readingToDraft({ ...base, vintage: 'nv' }).vintage).toBe('NV');
    expect(readingToDraft({ ...base, vintage: '' }).vintage).toBeNull();
    expect(readingToDraft({ ...base, vintage: '20?1' }).vintage).toBeNull();
    expect(readingToDraft({ ...base, style: 'unknown' }).style).toBeNull();
  });

  it('builds an in-store query', () => {
    expect(readingToQuery({ ...base, vintage: '' })).toBe('Ridge Lytton Springs Dry Creek Valley Zinfandel Petite Sirah');
  });
});
