// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { checkPricesWithClaude } from './priceCheckClient';

/**
 * Real price check against the Anthropic API, for measuring what one costs. Opt-in only:
 *   PALATE_LIVE_PRICE=1 NODE_USE_ENV_PROXY=1 npx vitest run src/lib/priceCheck.live.test.ts --silent=false
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const key = env.PALATE_LIVE_PRICE ? env.PALATE_TEST_KEY : undefined;

describe.skipIf(!key)('Price check (live)', () => {
  it('finds current prices for watched bottles in one request', { timeout: 600_000 }, async () => {
    const watched = [
      wine({ producer: 'Marchesi di Barolo', name: 'Barolo', region: 'Barolo', grapes: ['Nebbiolo'], style: 'red', rating: 'loved', watch: true, price: 45 }),
      wine({ producer: 'E. Guigal', name: 'Côtes du Rhône Rouge', region: 'Côtes du Rhône', grapes: ['Grenache', 'Syrah'], style: 'red', rating: 'loved', watch: true, price: 15 }),
      wine({ producer: 'Château Lynch-Bages', name: 'Pauillac', vintage: 2019, region: 'Pauillac', grapes: ['Cabernet Sauvignon'], style: 'red', list: 'want', watch: true }),
      wine({ producer: 'Cloudy Bay', name: 'Sauvignon Blanc', region: 'Marlborough', grapes: ['Sauvignon Blanc'], style: 'white', rating: 'loved', watch: true, price: 30 }),
    ];
    const t0 = Date.now();
    const out = await checkPricesWithClaude(key!, watched);
    console.log(`took ${Math.round((Date.now() - t0) / 1000)}s`);
    expect(out.ok, out.ok ? '' : out.reason).toBe(true);
    if (!out.ok) return;
    console.log('usage:', JSON.stringify(out.usage));
    for (const w of watched) {
      const p = out.prices.get(w.id);
      console.log(`- ${w.producer} ${w.name}: ${p ? `$${p.price} at ${p.store} ${p.url}` : 'not found'}`);
    }
  });
});
