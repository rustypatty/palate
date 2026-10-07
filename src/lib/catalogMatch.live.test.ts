// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { norm } from './catalogNorm';
import { lookupCatalog, searchCatalogAt, type CatalogMatch, type CatalogWine } from './catalogMatch';
import { CASES, type MatchCase } from './catalogMatch.cases';

/**
 * Runs every case in catalogMatch.cases.ts against the real catalog (free: a public read-only search).
 * Skipped unless CATALOG_URL and CATALOG_KEY hold the Supabase address and publishable key (CATALOG_CACHE, optional,
 * names a file to keep results in so the ranking can be re-tuned without searching again):
 *   NODE_USE_ENV_PROXY=1 CATALOG_URL=… CATALOG_KEY=… npx vitest run src/lib/catalogMatch.live.test.ts --silent=false
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const url = env.CATALOG_URL;
const key = env.CATALOG_KEY;
const cacheFile = env.CATALOG_CACHE;

const label = (w: CatalogWine) => `${w.producer ?? ''} | ${w.cuvee ?? ''}${w.wine_type ? ` (${w.wine_type})` : ''}`;

function judge(expect: string, w: CatalogWine | null): 'right' | 'wrong' | 'skip' {
  if (expect === 'skip') return 'skip';
  if (expect === 'none') return w ? 'wrong' : 'right';
  if (!w) return 'skip';
  const hay = norm(`${w.producer ?? ''} ${w.cuvee ?? ''} ${w.display_name ?? ''}`);
  return expect.split('|').some((alt) => alt.trim().split(' ').every((word) => hay.includes(word))) ? 'right' : 'wrong';
}

describe.skipIf(!url || !key)('catalog matching (live)', () => {
  it('matches the test wines', { timeout: 600_000 }, async () => {
    const rows: string[] = [];
    const tally: Record<string, Record<string, number>> = {};
    const wrong: string[] = [];
    let i = 0;
    let timeouts = 0;
    const t0 = Date.now();
    const results: { c: MatchCase; cands: CatalogWine[]; m: CatalogMatch }[] = new Array(CASES.length);
    // Node's file functions, without making the browser build depend on Node's types.
    const fs = cacheFile ? await import(/* @vite-ignore */ `node:${'fs'}`) : null;
    const cache: Record<string, CatalogWine[]> = fs?.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
    await Promise.all(
      Array.from({ length: 1 }, async () => {
        while (i < CASES.length) {
          const n = i++;
          const c = CASES[n];
          const search = async (text: string) => {
            for (let attempt = 0; !cache[text]; attempt++) {
              try {
                cache[text] = await searchCatalogAt(url!, key!, text, 25);
              } catch (e) {
                if (attempt >= 3) throw e;
                timeouts++;
              }
            }
            return cache[text];
          };
          const { match, candidates } = await lookupCatalog(c.q, search);
          results[n] = { c, cands: candidates, m: match };
        }
      }),
    );
    fs?.writeFileSync(cacheFile, JSON.stringify(cache));
    for (const { c, cands, m } of results) {
      const q = c.q.text ?? `${c.q.producer} / ${c.q.name} / ${c.q.style}`;
      const got = m.status === 'match' ? m.wine : null;
      const verdict = judge(c.expect, got);
      // A miss or "uncertain" on a wine that should match: was the right wine among the candidates?
      const present = c.expect !== 'none' && c.expect !== 'skip' && cands.some((w: CatalogWine) => judge(c.expect, w) === 'right');
      const outcome =
        m.status === 'match' ? (verdict === 'wrong' ? 'WRONG' : verdict === 'right' ? 'match' : 'match?') : m.status === 'uncertain' ? 'uncertain' : c.expect === 'none' ? 'none ✓' : 'none';
      const t = (tally[c.set] ??= {});
      t[outcome] = (t[outcome] ?? 0) + 1;
      if (outcome === 'WRONG') wrong.push(q);
      const detail =
        m.status === 'match'
          ? `${label(m.wine)}  ${m.score.toFixed(2)}${m.wine.image_url ? '' : '  (no photo)'}`
          : m.status === 'uncertain'
            ? m.options.map((w, k) => `${label(w)} ${m.scores[k].toFixed(2)}`).join('  /  ')
            : present
              ? '(right wine WAS a candidate)'
              : '';
      rows.push(`${c.set.padEnd(10)} ${outcome.padEnd(9)} ${q}\n${''.padEnd(21)}→ ${detail}`);
    }
    console.log(rows.join('\n'));
    console.log(JSON.stringify(tally, null, 1));
    console.log(`${CASES.length} searches in ${Math.round((Date.now() - t0) / 1000)}s, ${timeouts} timed out and were retried`);
    expect(wrong, 'wrong matches').toEqual([]);
  });
});
