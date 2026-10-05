// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { isCameraPhoto, shownPhoto } from './image';

describe('camera photos are never shown', () => {
  const web = { kind: 'remote' as const, url: 'https://example.com/b.png', source: { name: 'Total Wine', pageUrl: 'https://example.com' } };
  const saved = { kind: 'local' as const, blobId: 'a', source: { name: 'Johnston Fine Wines', pageUrl: 'https://example.com' } };
  const snap = { kind: 'local' as const, blobId: 'b', source: { name: 'Your photo' } };
  const old = { kind: 'local' as const, blobId: 'c' };

  it('tells your own photos from web photos', () => {
    expect(isCameraPhoto(web)).toBe(false);
    expect(isCameraPhoto(saved)).toBe(false);
    expect(isCameraPhoto(snap)).toBe(true);
    expect(isCameraPhoto(old)).toBe(true);
    expect(isCameraPhoto(null)).toBe(false);
  });

  it('shows only web photos', () => {
    expect(shownPhoto(web)).toBe(web);
    expect(shownPhoto(saved)).toBe(saved);
    expect(shownPhoto(snap)).toBeNull();
    expect(shownPhoto(old)).toBeNull();
  });
});
