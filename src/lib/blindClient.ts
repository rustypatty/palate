import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { claudeClient } from './claude';
import { reason } from './coachClient';

const MODEL = 'claude-opus-5-5';

export interface ExplainRequest {
  /** The wine as it really is: "Bernard Baudry Chinon 2020 · Cabernet Franc · Loire, France · $28". */
  wine: string;
  /** Each guess against the answer: "Grape: said Merlot, was Cabernet Franc (wrong)". */
  checks: string[];
  noticed: string[];
  /** Your profile and rated wines (shelfContext). */
  context: string;
}

export type ExplainOutcome = { ok: true; explain: { text: string; tip: string } } | { ok: false; reason: string };

const ExplainSchema = z.object({
  text: z.string().describe(
    'Why my guesses went the way they did: connect what I noticed to what this wine really is, say which clue gave it away, and be kind about near misses. ' +
      'If I have rated similar wines, mention one by name. 3–4 sentences, plain words, explain any wine term briefly.',
  ),
  tip: z.string().describe('One short rule of thumb for next time, e.g. "Red fruit + herbs + bright acid → think Loire Cabernet Franc before Bordeaux." Under 20 words.'),
});

/** The lesson after a blind tasting (about 2–3¢, no web search). */
export async function explainBlindWithClaude(apiKey: string, r: ExplainRequest, signal?: AbortSignal): Promise<ExplainOutcome> {
  // Browser use is intentional: the key is the user's own. No automatic retries: a retry would be billed twice.
  const client = claudeClient(apiKey, { maxRetries: 0, timeout: 120_000, defaultHeaders: { 'x-palate-feature': 'blind' } });
  const content = [
    `I just tasted this wine blind: ${r.wine}.`,
    `My guesses:\n${r.checks.map((c) => `- ${c}`).join('\n')}`,
    r.noticed.length ? `What I noticed: ${r.noticed.join(', ')}.` : 'I did not note anything in particular.',
    'Explain how I did.',
  ].join('\n\n');
  try {
    const res = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system:
          'You are a friendly sommelier coaching me after a blind tasting. Be specific and encouraging, like a knowledgeable friend. ' +
          'Use only what you know about this wine; do not invent facts about it.\n\n' +
          r.context,
        output_config: { effort: 'low', format: betaZodOutputFormat(ExplainSchema) },
        messages: [{ role: 'user', content }],
      },
      { signal },
    );
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'Claude couldn’t answer that' };
    if (res.stop_reason === 'max_tokens' || !res.parsed_output) return { ok: false, reason: 'the answer was cut short — try again' };
    return { ok: true, explain: res.parsed_output };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const why = reason(e);
    if (why) return { ok: false, reason: why };
    throw e;
  }
}
