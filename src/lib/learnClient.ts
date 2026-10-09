import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { claudeClient } from './claude';
import type { LessonOutcome, LessonRequest } from './learn';

const MODEL = 'claude-opus-5-5';

// Each card's headline, shown big at the top of its card.
const big = (what: string, example: string) => z.string().describe(`${what}, in one or two words (e.g. "${example}").`);
const title = (example: string) => z.string().describe(`A title for this card, at most 8 words (e.g. "${example}").`);
const term = z
  .string()
  .describe('The first wine term in this card a learner may not know, as "Term: plain-word definition." in one sentence. Empty if there is none.');

const LessonSchema = z.object({
  grape: z
    .string()
    .describe('The grape: what this grape (or, for a blend, each main grape) brings to the glass — fruit, structure, texture — and why. 2–3 sentences.'),
  place: z
    .string()
    .describe('The place: how this region’s climate, soils and traditions shape this wine, and what that means in the glass. 2–3 sentences.'),
  making: z
    .string()
    .describe(
      'How it’s made: the winemaking that shapes it (e.g. oak or none, ageing, whole clusters, blending, what a classification on the label requires). ' +
        'Say what this producer is known to do only if you know it; otherwise describe what is typical here and say that it is typical. 2–3 sentences.',
    ),
  taste_for: z
    .string()
    .describe(
      'One concrete thing to notice the next time I drink it, as a small tasting exercise that ties back to the lesson. ' +
        'If one of my related bottles makes a good comparison, name it. 1–2 sentences.',
    ),
  grape_big: big('The main grape', 'Tempranillo'),
  grape_title: title('Cherry and leather, with a bright lift'),
  grape_term: term,
  place_big: big('The place: the sub-region or appellation', 'Rioja Alta'),
  place_title: title('Sheltered by mountains, cooled at night'),
  place_term: term,
  making_big: big('The key fact about how it’s made', 'Five years'),
  making_title: title('What “Gran Reserva” requires'),
  making_term: term,
  taste_big: big('A word to start the tasting exercise', 'Notice…'),
  taste_title: title('Fresh fruit, then aged notes, then the lift'),
  taste_term: term,
});

function reason(e: unknown): string | null {
  if (e instanceof Anthropic.AuthenticationError) return 'your Anthropic key was rejected — check it in My palate';
  if (e instanceof Anthropic.RateLimitError) return 'too many requests right now — try again in a moment';
  if (e instanceof Anthropic.APIConnectionError) return 'no connection';
  if (e instanceof Anthropic.BadRequestError && /credit/i.test(e.message)) return 'your Anthropic account is out of credit';
  if (e instanceof Anthropic.APIError) return `Anthropic API error (${e.status ?? 'unknown'})`;
  return null;
}

export async function lessonWithClaude(apiKey: string, r: LessonRequest, signal?: AbortSignal): Promise<LessonOutcome> {
  // No automatic retries: a retry would be billed twice.
  const client = claudeClient(apiKey, { maxRetries: 0, timeout: 120_000 });
  const system =
    'You are teaching me about wine through the bottles I own and want to try. I am learning, so explain why the wine tastes the way it does ' +
    'in plain words, and explain any wine term the first time you use it. Be specific to this wine and place rather than generic. ' +
    'Never state a fact about this producer or vintage you are not sure of; say what is typical instead. Do not repeat the wine’s name back to me.';
  const facts = [
    `Producer: ${r.producer || 'unknown'}`,
    `Wine: ${r.name || 'unknown'}`,
    `Vintage: ${r.vintage || 'unknown'}`,
    r.region && `Region/appellation: ${r.region}`,
    r.country && `Country: ${r.country}`,
    r.style && `Colour/style: ${r.style}`,
    r.grapes.length && `Grapes: ${r.grapes.join(', ')}`,
    r.related.length && `My related bottles: ${r.related.join('; ')}`,
  ]
    .filter(Boolean)
    .join('\n');
  try {
    const res = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 3000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        output_config: { effort: 'low', format: betaZodOutputFormat(LessonSchema) },
        messages: [{ role: 'user', content: `Teach me why this wine tastes the way it does.\n\n${facts}` }],
      },
      { signal },
    );
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'Claude couldn’t answer that' };
    if (res.stop_reason === 'max_tokens' || !res.parsed_output) return { ok: false, reason: 'the answer was cut short — try again' };
    const o = res.parsed_output;
    return {
      ok: true,
      lesson: {
        grape: o.grape,
        place: o.place,
        making: o.making,
        tasteFor: o.taste_for,
        cards: [
          { big: o.grape_big, title: o.grape_title, term: o.grape_term },
          { big: o.place_big, title: o.place_title, term: o.place_term },
          { big: o.making_big, title: o.making_title, term: o.making_term },
          { big: o.taste_big, title: o.taste_title, term: o.taste_term },
        ],
      },
    };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const why = reason(e);
    if (why) return { ok: false, reason: why };
    throw e;
  }
}
