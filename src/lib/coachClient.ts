import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { BottleCoach, CoachOutcome, CoachRequest } from './coach';

const MODEL = 'claude-opus-5-5';

const CoachSchema = z.object({
  verdict: z.enum(['buy', 'consider', 'skip']).describe('"buy" if it fits me well at this price, "consider" if it is a reasonable but not ideal fit, "skip" if it does not suit me.'),
  headline: z.string().describe('One line I can act on, e.g. "Buy it — a classic Rioja Reserva right in the lane of the Riojas you loved." Under 16 words.'),
  what_it_is: z.string().describe('Coach me: what this wine is — producer, appellation, grape(s), and what any classification on the label (Reserva, 1er Cru, Gran Selezione…) means. 2–3 sentences.'),
  taste: z.string().describe('What it will likely taste like: aromas, fruit, tannin, acidity, body, oak, finish. Say if it is young and needs time or air. 2–3 sentences, in your own words.'),
  fit: z.string().describe('How it fits my taste, comparing it by name with specific wines I have rated (and words from my notes or profile): what will feel familiar and what will differ. 2–4 sentences.'),
  value: z.string().describe('Price take: the shelf price if I gave one, else its usual US retail; whether that is fair and whether it is within my budget. 1–2 sentences. Empty if you truly cannot say.'),
  serve: z.string().describe('How to enjoy it: serving temperature, decanting, food, and drink-now vs cellar. One or two sentences.'),
  caveat: z.string().describe('Anything uncertain (vintage variation, unclear label, a style I have not tried). One sentence or empty.'),
});

// Keep the schema and the app's type in step.
const _check: z.infer<typeof CoachSchema> extends BottleCoach ? true : never = true;
void _check;

function reason(e: unknown): string | null {
  if (e instanceof Anthropic.AuthenticationError) return 'your Anthropic key was rejected — check it in My palate';
  if (e instanceof Anthropic.RateLimitError) return 'too many requests right now — try again in a moment';
  if (e instanceof Anthropic.APIConnectionError) return 'no connection';
  if (e instanceof Anthropic.BadRequestError && /credit/i.test(e.message)) return 'your Anthropic account is out of credit';
  if (e instanceof Anthropic.APIError) return `Anthropic API error (${e.status ?? 'unknown'})`;
  return null;
}

export async function coachBottleWithClaude(apiKey: string, r: CoachRequest, signal?: AbortSignal): Promise<CoachOutcome> {
  // Browser use is intentional: the key is the user's own. No automatic retries: a retry would be billed twice.
  const client = new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com', dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 120_000 });
  const system =
    'You are my wine coach in a shop, helping me decide on one bottle I am holding. Be specific and honest, like a knowledgeable friend: ' +
    'name the wines of mine you compare it with, explain wine terms briefly, and do not oversell. Use only what you know about this wine; ' +
    'if you are unsure of something, say so in the caveat rather than guessing.\n\n' +
    r.context;
  const facts = [
    `Producer: ${r.producer || 'unknown'}`,
    `Wine: ${r.name || 'unknown'}`,
    `Vintage: ${r.vintage || 'unknown'}`,
    r.region && `Region/appellation: ${r.region}`,
    r.country && `Country: ${r.country}`,
    r.style && `Colour/style: ${r.style}`,
    r.grapes.length && `Grapes: ${r.grapes.join(', ')}`,
    r.shelfPrice ? `Shelf price here: $${r.shelfPrice}` : r.typicalPrice ? `Lowest US retail seen recently: about $${Math.round(r.typicalPrice)}` : 'Price: not known',
    r.store && `Store: ${r.store}`,
  ]
    .filter(Boolean)
    .join('\n');
  try {
    const res = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        output_config: { effort: 'low', format: betaZodOutputFormat(CoachSchema) },
        messages: [{ role: 'user', content: `Should I buy this bottle?\n\n${facts}` }],
      },
      { signal },
    );
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'Claude couldn’t answer that' };
    if (res.stop_reason === 'max_tokens' || !res.parsed_output) return { ok: false, reason: 'the answer was cut short — try again' };
    return { ok: true, coach: res.parsed_output };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const r = reason(e);
    if (r) return { ok: false, reason: r };
    throw e;
  }
}
