// @vitest-environment node
/**
 * Live check of the Total Wine suggestion search against the real Anthropic API (about 25¢ a run).
 * Skipped unless ANTHROPIC_API_KEY is set:
 *   ANTHROPIC_API_KEY=sk-ant-api... npx vitest run scripts/totalwine.live.test.ts
 */
import { expect, it } from 'vitest';
import { findStoreListWithClaude, normalizeUrl } from '../src/lib/storeListClient';
import { storeById } from '../src/lib/stores';

const key = process.env.ANTHROPIC_API_KEY ?? '';

it.skipIf(!key)('finds real Total Wine bottles', { timeout: 600_000 }, async () => {
  const queries: string[] = [];
  const results: string[] = [];
  const reported: { url: string; title: string }[] = [];
  let input = 0;
  let output = 0;
  let searches = 0;
  const started = Date.now();
  const out = await findStoreListWithClaude(
    key,
    {
      store: storeById('totalwine'),
      taste: ['Loves Southern Rhône reds and Grenache blends, likes Loire Chenin Blanc, not keen on oaky California Chardonnay.'],
      loved: ['Domaine de la Janasse Côtes du Rhône 2022 (Grenache, $18)', 'Château de Saint Cosme Gigondas 2021 ($45)'],
      liked: ['Domaine Huet Vouvray Le Haut-Lieu Sec 2020 ($40)'],
      disliked: ['Rombauer Chardonnay 2023 ($45)'],
      skip: ['Domaine de la Janasse Côtes du Rhône'],
      budget: 40,
    },
    undefined,
    (res) => {
      input += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
      output += res.usage.output_tokens;
      searches += res.usage.server_tool_use?.web_search_requests ?? 0;
      for (const b of res.content) {
        if (b.type === 'server_tool_use') queries.push(JSON.stringify(b.input));
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.type === 'web_search_result') results.push(r.url);
        if (b.type === 'tool_use' && b.name === 'report_store_list') {
          for (const p of (b.input as { picks: { url: string; producer: string; wine: string }[] }).picks) reported.push({ url: p.url, title: `${p.producer} ${p.wine}` });
        }
      }
    },
  );
  const seen = new Set(results.map(normalizeUrl));
  console.log(
    [
      `took ${Math.round((Date.now() - started) / 1000)}s, ${searches} searches, ${input} in / ${output} out tokens`,
      `queries:\n  ${queries.join('\n  ')}`,
      `search results (${results.length}):\n  ${results.join('\n  ')}`,
      `reported picks (${reported.length}):\n  ${reported.map((p) => `${seen.has(normalizeUrl(p.url)) ? 'ok     ' : 'DROPPED'} ${p.title}  ${p.url}`).join('\n  ')}`,
      `outcome: ${JSON.stringify(out, null, 2)}`,
    ].join('\n\n'),
  );
  expect(out.ok).toBe(true);
  if (out.ok) expect(out.list.picks.length).toBeGreaterThan(0);
});
