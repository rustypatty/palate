// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { knownIds, wineLines } from './ask';

/**
 * A real question to Claude about a small sample collection. Opt-in only:
 *   PALATE_TEST_KEY=sk-ant-… NODE_USE_ENV_PROXY=1 npx vitest run src/lib/ask.live.test.ts --silent=false
 */
const key = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PALATE_TEST_KEY;

const wines = [
  wine({ id: 'muga', producer: 'Bodegas Muga', name: 'Rioja Reserva', vintage: 2019, style: 'red', country: 'Spain', region: 'Rioja', grapes: ['Tempranillo'], price: 28, rating: 'loved', owned: 1 }),
  wine({ id: 'petalos', producer: 'Descendientes de J. Palacios', name: 'Pétalos', vintage: 2020, style: 'red', country: 'Spain', region: 'Bierzo', grapes: ['Mencía'], price: 26, rating: 'loved' }),
  wine({ id: 'pinot', producer: 'Sweet Valley', name: 'Pinot Noir', vintage: 2022, style: 'red', country: 'USA', region: 'California', grapes: ['Pinot Noir'], price: 18, rating: 'wouldnt' }),
];

describe.skipIf(!key)('Ask your wines (live)', () => {
  it('answers from the list, naming the right wines, and declines off-topic questions', { timeout: 300_000 }, async () => {
    const { askWinesWithClaude } = await import('./askClient');
    const c = { lines: wineLines(wines), count: wines.length, about: '', year: 2026 };
    const spain = await askWinesWithClaude(key!, c, [], 'What did I love from Spain?');
    expect(spain.ok, spain.ok ? '' : spain.reason).toBe(true);
    if (!spain.ok) return;
    console.log(spain.answer);
    expect(spain.answer.fromList).toBe(true);
    expect(knownIds(spain.answer.wineIds, wines).sort()).toEqual(['muga', 'petalos']);

    const off = await askWinesWithClaude(key!, c, [], 'Who won the World Cup in 2022?');
    expect(off.ok).toBe(true);
    if (off.ok) expect(`${off.answer.headline} ${off.answer.italic}`.toLowerCase()).toContain('wine');
  });
});
