// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

/**
 * Real wine list read + overview against the Anthropic API, to time it and see what it costs. Opt-in only:
 *   PALATE_LIVE_LIST=/path/to/menu.jpg NODE_USE_ENV_PROXY=1 npx vitest run src/lib/wineList.live.test.ts --silent=false
 */
type NodeProcess = { env: Record<string, string | undefined>; getBuiltinModule: (m: 'node:fs') => { readFileSync: (p: string) => Uint8Array } };
const proc = (globalThis as { process?: NodeProcess }).process;
const env = proc?.env ?? {};
const photo = env.PALATE_LIVE_LIST;
const key = photo ? env.PALATE_TEST_KEY : undefined;

// Node has no canvas: send the photo as it is (Claude scales it down itself).
vi.mock('./image', () => ({ resizeImage: async (b: Blob) => ({ blob: b, width: 0, height: 0 }) }));

describe.skipIf(!key)('Wine list (live)', () => {
  it('reads a list and gives the overview with every section', { timeout: 600_000 }, async () => {
    const { readWineListWithClaude, overviewWineListWithClaude, lastRun } = await import('./wineListClient');
    const report = (what: string) => {
      const u = lastRun.usage as unknown as { input_tokens: number; output_tokens: number; output_tokens_details?: { thinking_tokens?: number } } | null;
      console.log(`${what}: first text after ${(lastRun.firstTextMs / 1000).toFixed(1)}s, done after ${(lastRun.totalMs / 1000).toFixed(1)}s · in ${u?.input_tokens} · out ${u?.output_tokens} (thinking ${u?.output_tokens_details?.thinking_tokens ?? '?'})`);
    };
    const t0 = Date.now();
    let firstText = 0;
    let firstPick = 0;
    const read = await readWineListWithClaude(key!, [new Blob([proc!.getBuiltinModule('node:fs').readFileSync(photo!) as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })]);
    const t1 = Date.now();
    report('read');
    expect(read.ok, read.ok ? '' : read.reason).toBe(true);
    if (!read.ok) return;
    const list = { at: Date.now(), pages: 1, wines: read.wines, unreadable: read.unreadable, turns: [], done: {} };
    const context =
      'My taste, from my own ratings: I lean toward structured reds: Barolo, Rioja, Châteauneuf-du-Pape and Pauillac; Nebbiolo, Tempranillo, Grenache and Syrah.\n' +
      'Wines I loved: a Barolo from La Morra; a Rioja Reserva; a Châteauneuf-du-Pape; a Mercurey 1er Cru.\nWines I would not buy again: a soft, sweet California Pinot Noir.';
    if (env.PALATE_LIVE_READ_ONLY) return;
    const out = await overviewWineListWithClaude(key!, list, context, null, undefined, (a) => {
      if (!firstText && a.reply) firstText = Date.now();
      if (!firstPick && a.sections?.length) firstPick = Date.now();
    });
    const t2 = Date.now();
    report('overview');
    if (env.PALATE_LIVE_READ_ONLY) return;
    const sec = (a: number, b: number) => `${Math.round((b - a) / 1000)}s`;
    console.log(`read: ${read.wines.length} wines in ${sec(t0, t1)} · overview: first words after ${sec(t1, firstText)}, first pick after ${sec(t1, firstPick)}, done after ${sec(t1, t2)} · total ${sec(t0, t2)}`);
    expect(out.ok, out.ok ? '' : out.reason).toBe(true);
    if (!out.ok) return;
    console.log(out.answer.reply);
    for (const s of out.answer.sections ?? []) {
      console.log(`\n== ${s.kind}`);
      for (const p of s.picks) {
        const w = list.wines[p.n - 1];
        console.log(`- ${w.producer} ${w.wine} ${w.vintage} $${w.price}${w.glass_price ? ` / $${w.glass_price} glass` : ''} [${p.details?.grapes.join('/')} · ${p.details?.region}]: ${p.why}`);
      }
    }
    console.log('\ntip:', out.answer.tip);
    console.log('\nall wines read:', read.wines.map((w) => `${w.section} | ${w.producer} | ${w.wine} | ${w.vintage} | ${w.glass_price}/${w.price}`).join('\n'));
  });
});
