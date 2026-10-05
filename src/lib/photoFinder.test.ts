import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../db';
import type { Wine } from '../types';
import { needsPhoto, photoQueue } from './photoFinder';

const wine = (over: Partial<Wine>): Wine => ({ ...emptyDraft(), id: 'w', createdAt: 0, updatedAt: 0, ...over });

describe('photo finder', () => {
  it('looks for a photo when only a camera snap or nothing is there', () => {
    expect(needsPhoto(wine({ producer: 'Lafarge' }))).toBe(true);
    expect(needsPhoto(wine({ producer: 'Lafarge', photo: { kind: 'local', blobId: 'b', source: { name: 'Your photo' } } }))).toBe(true);
    expect(needsPhoto(wine({ producer: 'Lafarge', photo: { kind: 'remote', url: 'https://x/y.jpg', source: { name: 'shop.com' } } }))).toBe(false);
    expect(needsPhoto(wine({}))).toBe(false); // nothing to search for
  });

  it('tries each wine once, again if its name changes or after two weeks', () => {
    const w = wine({ id: 'a', producer: 'Lafarge', name: 'Volnay' });
    const sig = 'lafarge|volnay||';
    expect(photoQueue([w], 1000, {})).toHaveLength(1);
    expect(photoQueue([w], 1000, { a: { at: 900, sig } })).toHaveLength(0);
    expect(photoQueue([{ ...w, name: 'Volnay Clos des Chênes' }], 1000, { a: { at: 900, sig } })).toHaveLength(1);
    expect(photoQueue([w], 900 + 15 * 86_400_000, { a: { at: 900, sig } })).toHaveLength(1);
  });
});
