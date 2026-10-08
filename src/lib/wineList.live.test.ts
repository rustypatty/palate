// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

/**
 * Real wine list read + overview against the Anthropic API, to time it and see what it costs. Opt-in only:
 *   PALATE_LIVE_LIST=/path/to/menu.jpg NODE_USE_ENV_PROXY=1 npx vitest run src/lib/wineList.live.test.ts --silent=false
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const photo = env.PALATE_LIVE_LIST;
const key = photo ? env.PALATE_TEST_KEY : undefined;

// Node has no canvas: send the photo as it is (Claude scales it down itself).
vi.mock('./image', () => ({ resizeImage: async (b: Blob) => ({ blob: b, width: 0, height: 0 }) }));

describe.skipIf(!key)('Wine list (live)', () => {
  it('reads a list and gives the overview with every section', { timeout: 600_000 }, async () => {
    const usage: { input_tokens: number; output_tokens: number }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      const res = await realFetch(...args);
      res.clone().json().then((j: { usage?: { input_tokens: number; output_tokens: number } }) => j.usage && usage.push(j.usage)).catch(() => {});
      return res;
    }) as typeof fetch;
    const { readWineListWithClaude, overviewWineListWithClaude } = await import('./wineListClient');
    const t0 = Date.now();
    const read = await readWineListWithClaude(key!, [new Blob([readFileSync(photo!)], { type: 'image/jpeg' })]);
    const t1 = Date.now();
    expect(read.ok, read.ok ? '' : read.reason).toBe(true);
    if (!read.ok) return;
    const list = { at: Date.now(), pages: 1, wines: read.wines, unreadable: read.unreadable, turns: [], done: {} };
    const context =
      'My taste, from my own ratings: I lean toward structured reds: Barolo, Rioja, Châteauneuf-du-Pape and Pauillac; Nebbiolo, Tempranillo, Grenache and Syrah.\n' +
      'Wines I loved: a Barolo from La Morra; a Rioja Reserva; a Châteauneuf-du-Pape; a Mercurey 1er Cru.\nWines I would not buy again: a soft, sweet California Pinot Noir.';
    const out = await overviewWineListWithClaude(key!, list, context, null);
    const t2 = Date.now();
    await new Promise((r) => setTimeout(r, 300));
    globalThis.fetch = realFetch;
    console.log(`read: ${read.wines.length} wines in ${Math.round((t1 - t0) / 1000)}s · overview: ${Math.round((t2 - t1) / 1000)}s`);
    console.log('usage:', JSON.stringify(usage));
    expect(out.ok, out.ok ? '' : out.reason).toBe(true);
    if (!out.ok) return;
    console.log(out.answer.reply);
    for (const s of out.answer.sections ?? []) {
      console.log(`\n== ${s.kind}`);
      for (const p of s.picks) {
        const w = list.wines[p.n - 1];
        console.log(`- ${w.producer} ${w.wine} ${w.vintage} $${w.price}${w.glass_price ? ` / $${w.glass_price} glass` : ''}: ${p.why}`);
      }
    }
    console.log('\ntip:', out.answer.tip);
  });
});
