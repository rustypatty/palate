import { describe, expect, it } from 'vitest';
import { isStaleApp } from './appUpdate';

describe('isStaleApp', () => {
  it('spots a part of the app that is gone after an update', () => {
    expect(isStaleApp(new TypeError('Failed to fetch dynamically imported module: https://x/assets/labelClient-abc.js'))).toBe(true);
    expect(isStaleApp(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleApp(new Error('Your Anthropic API key was rejected.'))).toBe(false);
  });
});
