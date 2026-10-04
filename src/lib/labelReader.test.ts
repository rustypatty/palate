import { describe, expect, it } from 'vitest';
import { apiKeyProblem, normalizeApiKey, readingToDraft, readingToQuery, type LabelReading } from './labelReader';

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

describe('API key checks', () => {
  const real = 'sk-ant-api03-' + 'a'.repeat(93) + 'AA';

  it('cleans up copy-paste debris', () => {
    expect(normalizeApiKey(`  "${real.slice(0, 50)}\n${real.slice(50)}\u200B" `)).toBe(real);
  });

  it('accepts a full key', () => {
    expect(apiKeyProblem(real)).toBeNull();
  });

  it('explains common mix-ups', () => {
    expect(apiKeyProblem('sk-ant-api03-AbC…xYz')).toMatch(/shortened/);
    expect(apiKeyProblem('sk-ant-api03-AbC...xYz')).toMatch(/shortened/);
    expect(apiKeyProblem('sk-ant-admin01-' + 'a'.repeat(90))).toMatch(/Admin key/);
    expect(apiKeyProblem('sk-ant-oat01-' + 'a'.repeat(90))).toMatch(/sign-in token/);
    expect(apiKeyProblem('sk-proj-' + 'a'.repeat(90))).toMatch(/doesn’t look like/);
    expect(apiKeyProblem(real.slice(0, 40))).toMatch(/cut off/);
  });
});
