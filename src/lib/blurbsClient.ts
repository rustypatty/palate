import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { claudeClient } from './claude';
import { reason } from './coachClient';
import { SHARE_TAGS, type ShareBlurb } from './share';
import type { BlurbAsk } from './shareBlurbs';

const MODEL = 'claude-opus-5-5';

const BlurbsSchema = z.object({
  wines: z.array(
    z.object({
      n: z.number().int().describe('The wine’s number from the list.'),
      tag: z.enum(SHARE_TAGS).describe('The one taste tag that fits best.'),
      line: z.string().describe('One plain sentence for someone new to wine: what it tastes like and how it feels. No wine jargon (no "tannins", "terroir", "structure"). Under 16 words.'),
      pairing: z.string().describe('Three everyday foods it goes with, comma-separated, lower case. E.g. "roast chicken, mushrooms, salmon".'),
    }),
  ),
});

/** Tags, plain lines and foods for several wines in one request (a few cents, no web search). */
export async function writeBlurbsWithClaude(apiKey: string, asks: BlurbAsk[], signal?: AbortSignal): Promise<{ ok: true; blurbs: (ShareBlurb | null)[] } | { ok: false; reason: string }> {
  // Browser use is intentional: the key is the user's own. No automatic retries: a retry would be billed twice.
  const client = claudeClient(apiKey, { maxRetries: 0, timeout: 120_000, defaultHeaders: { 'x-palate-feature': 'blurbs' } });
  const lines = asks.map((a, i) => {
    const what = [a.producer, a.name, a.vintage].filter(Boolean).join(' ');
    const more = [a.style, a.place, a.grapes.join('/')].filter(Boolean).join(', ');
    return `${i + 1}. ${what}${more ? ` (${more})` : ''}${a.about ? `\n   About it: ${a.about}` : ''}`;
  });
  try {
    const res = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system:
          'You write for a page where I share wines I love with friends who know little about wine. Be warm, plain and concrete, like describing food. ' +
          'Use only what you know about each wine and what is given; do not invent awards or facts.',
        output_config: { effort: 'low', format: betaZodOutputFormat(BlurbsSchema) },
        messages: [{ role: 'user', content: `For each wine, give a taste tag, one plain sentence and three foods.\n\n${lines.join('\n')}` }],
      },
      { signal },
    );
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'Claude couldn’t answer that' };
    if (res.stop_reason === 'max_tokens' || !res.parsed_output) return { ok: false, reason: 'the answer was cut short' };
    const got = res.parsed_output.wines;
    return { ok: true, blurbs: asks.map((_, i) => { const b = got.find((x) => x.n === i + 1); return b ? { tag: b.tag, line: b.line.trim(), pairing: b.pairing.trim() } : null; }) };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const why = reason(e);
    if (why) return { ok: false, reason: why };
    throw e;
  }
}
