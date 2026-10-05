// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { shelfContext } from './shelf';
import { readShelfImagesWithClaude } from './shelfClient';

/**
 * Real "Snap a shelf" read against the Anthropic API (about 15¢ a run).
 * Skipped unless PALATE_TEST_KEY holds an API key and PALATE_SHELF_B64 points at a base64 JPEG of a shelf:
 *   NODE_USE_ENV_PROXY=1 PALATE_SHELF_B64=shelf.b64 npx vitest run src/lib/shelf.live.test.ts --silent=false
 */
type NodeProcess = { env: Record<string, string | undefined>; getBuiltinModule: (m: 'node:fs') => { readFileSync: (p: string, enc: 'utf8') => string } };
const proc = (globalThis as { process?: NodeProcess }).process;
const env = proc?.env ?? {};
const key = env.PALATE_TEST_KEY;
const photo = env.PALATE_SHELF_B64;

describe.skipIf(!key || !photo)('Snap a shelf (live)', () => {
  it('reads and ranks the bottles on a shelf photo', { timeout: 300_000 }, async () => {
    const context = shelfContext(
      [
        wine({ producer: 'Clos Saint Michel (Mousset)', name: 'Châteauneuf-du-Pape Cuvée Réservée', region: 'Châteauneuf-du-Pape', country: 'France', grapes: ['Grenache', 'Syrah'], rating: 'loved', notes: 'It’s good. I really like it.' }),
        wine({ producer: 'Château Puy d’Amour', name: 'Côtes de Bourg', region: 'Côtes de Bourg', country: 'France', rating: 'wouldnt', notes: 'No tannin grip, little fruit, very dry. Want a hint of fruit without being super fruity or sweet.' }),
        wine({ producer: 'Barone Ricasoli', name: 'Castello di Brolio Chianti Classico', region: 'Chianti Classico', country: 'Italy', rating: 'liked' }),
      ],
      undefined,
    );
    const t0 = Date.now();
    const out = await readShelfImagesWithClaude(key!, [proc!.getBuiltinModule('node:fs').readFileSync(photo!, 'utf8').trim()], context, 'Total Wine');
    console.log(`took ${Math.round((Date.now() - t0) / 1000)}s`);
    expect(out.ok, out.ok ? '' : out.reason).toBe(true);
    if (!out.ok) return;
    const r = out.report;
    console.log('summary:', r.summary);
    for (const b of r.bottles) console.log(`${b.rank}. [${b.verdict}] ${b.producer} | ${b.wine} ${b.vintage} | $${b.price_usd} ${b.price_call} (${b.price_note}) | ${b.why}`);
    console.log('compare:', r.comparisons, 'three:', r.buy_three, 'unreadable:', r.unreadable);
    expect(r.bottles.length).toBeGreaterThanOrEqual(3);
    expect(r.bottles.some((b) => b.price_usd > 50 && b.price_usd < 100)).toBe(true);
  });
});
