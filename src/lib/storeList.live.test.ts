// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { findStoreListWithClaude } from './storeListClient';
import { storeById } from './stores';

/**
 * Real Total Wine search against the Anthropic API (about 25¢ a run). Skipped unless
 * PALATE_TEST_KEY holds an API key:
 *   PALATE_TEST_KEY=sk-ant-... npx vitest run src/lib/storeList.live.test.ts --silent=false
 * (--silent=false prints the picks even when the test passes; behind an HTTPS proxy, also set
 * NODE_USE_ENV_PROXY=1.)
 */
// The app's tsconfig has no Node types; vitest runs this file under Node.
const key = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PALATE_TEST_KEY;

describe.skipIf(!key)('Total Wine search (live)', () => {
  it('finds real Total Wine bottles for a Southern Rhône lover', { timeout: 600_000 }, async () => {
    const out = await findStoreListWithClaude(key!, {
      store: storeById('totalwine'),
      taste: ['Loves Southern Rhône reds (Grenache, Syrah, Mourvèdre), usually $25–45.'],
      loved: ['Domaine La Millière Châteauneuf-du-Pape 2020', 'Clos Saint Michel Châteauneuf-du-Pape 2021'],
      liked: ['Domaine Santa Duc Gigondas 2019'],
      disliked: ['Rombauer Chardonnay'],
      skip: [],
      budget: 50,
    });
    console.log(JSON.stringify(out, null, 2));
    expect(out.ok, out.ok ? '' : out.reason).toBe(true);
    if (!out.ok) return;
    expect(out.list.picks.length).toBeGreaterThan(0);
    for (const p of out.list.picks) {
      expect(new URL(p.url).hostname).toMatch(/(^|\.)totalwine\.com$/);
      if (p.price !== null) expect(p.price).toBeLessThanOrEqual(50);
    }
  });
});
