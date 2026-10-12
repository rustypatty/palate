import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { claudeClient } from './claude';
import { reason } from './coachClient';

const MODEL = 'claude-opus-5-5';

export interface WindowAsk {
  producer: string;
  name: string;
  vintage: string;
  region: string;
  country: string;
  style: string;
  grapes: string[];
}

/** One answer per bottle, in the order asked; null where Claude couldn't sensibly say. */
export type WindowsOutcome = { ok: true; windows: ({ from: number; to: number } | null)[] } | { ok: false; reason: string };

const WindowsSchema = z.object({
  bottles: z.array(
    z.object({
      n: z.number().int().describe('The bottle’s number from the list.'),
      known: z.boolean().describe('False only if you cannot sensibly estimate when this bottle is at its best.'),
      from: z.number().int().describe('First year it is at its best (this year if it is ready now).'),
      to: z.number().int().describe('Last year it is at its best, before it starts to fade.'),
    }),
  ),
});

/** Drinking windows for several bottles in one request (about 1–3¢, no web search). */
export async function estimateWindowsWithClaude(apiKey: string, asks: WindowAsk[], year: number, signal?: AbortSignal): Promise<WindowsOutcome> {
  // Browser use is intentional: the key is the user's own. No automatic retries: a retry would be billed twice.
  const client = claudeClient(apiKey, { maxRetries: 0, timeout: 120_000, defaultHeaders: { 'x-palate-feature': 'drink-window' } });
  const lines = asks.map((a, i) => {
    const what = [a.producer, a.name, a.vintage || 'vintage unknown'].filter(Boolean).join(' ');
    const more = [a.region, a.country, a.style, a.grapes.join('/')].filter(Boolean).join(', ');
    return `${i + 1}. ${what}${more ? ` (${more})` : ''}`;
  });
  try {
    const res = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system:
          'You are a sommelier advising on bottles in my cellar. For each bottle, give the range of years it is at its best to drink, ' +
          'from what you know of the producer, wine, vintage and region. Be realistic: most everyday wines are best within a few years of the vintage; ' +
          'a non-vintage or unknown-vintage bottle is best soon after purchase. Never give a year before the vintage.',
        output_config: { effort: 'low', format: betaZodOutputFormat(WindowsSchema) },
        messages: [{ role: 'user', content: `It is ${year}. When is each of these bottles at its best?\n\n${lines.join('\n')}` }],
      },
      { signal },
    );
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'Claude couldn’t answer that' };
    if (res.stop_reason === 'max_tokens' || !res.parsed_output) return { ok: false, reason: 'the answer was cut short — try again' };
    const windows = asks.map((_, i) => {
      const b = res.parsed_output!.bottles.find((x) => x.n === i + 1);
      if (!b?.known || b.from < 1900 || b.to < b.from || b.to > year + 80) return null;
      return { from: b.from, to: b.to };
    });
    return { ok: true, windows };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const why = reason(e);
    if (why) return { ok: false, reason: why };
    throw e;
  }
}
