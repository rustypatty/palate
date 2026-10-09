import Anthropic from '@anthropic-ai/sdk';
import { claudeClient } from './claude';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { resizeImage } from './image';
import type { PriceCheckOutcome, ShelfOutcome, ShelfReport } from './shelf';

const MODEL = 'claude-opus-5-5';

const STYLES = ['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified', 'unknown'] as const;
const CALLS = ['bargain', 'fair', 'pricey', 'unknown'] as const;

const ShelfSchema = z.object({
  summary: z.string().describe('One or two sentences: what jumps out on this shelf for me, tied to what I have been enjoying.'),
  bottles: z.array(
    z.object({
      producer: z.string(),
      wine: z.string().describe('Cuvée, vineyard or appellation as on the label.'),
      vintage: z.string().describe('Year as printed, "NV", or empty if not visible.'),
      region: z.string(),
      country: z.string(),
      grapes: z.array(z.string()).describe('Main grapes, from the label or what the appellation requires; empty if unsure.'),
      style: z.enum(STYLES),
      price_usd: z.number().describe('Price on the shelf tag for this bottle; 0 if you cannot read it.'),
      verdict: z.enum(['top', 'good', 'pass']).describe('"top" for the best 1–3 buys for me, "good" for worth considering, "pass" for ones I should skip.'),
      rank: z.number().describe('1 = best match for me; rank every bottle.'),
      taste: z.string().describe('What it will taste like, in plain words: fruit, structure (tannin, acidity, body) and anything savory or oaky. 1–2 sentences, under 45 words.'),
      why: z.string().describe('Coach me: why it suits me or not, comparing it by name with specific wines I rated (or words from my notes), and briefly what the appellation, grape or classification means if that helps me learn. 2–3 sentences, under 80 words.'),
      price_call: z.enum(CALLS).describe('Shelf price vs what this bottle usually sells for in the US. "unknown" if no price or you are not confident.'),
      price_note: z.string().describe('Short, e.g. "Usually $85–95 — a good price" or "The better-value Barolo here". Empty if unknown.'),
      tip: z.string().describe('Optional practical tip, e.g. "Decant 2 hours if drinking now". Empty if none.'),
    }),
  ),
  comparisons: z.array(z.string()).describe('0–3 head-to-head calls between similar bottles here, e.g. which vintage to take or whether the pricier one is worth it.'),
  buy_three: z.object({
    picks: z.array(z.string()).describe('If I buy three, which (producer + wine), in order. Empty if fewer than three are worth it.'),
    lesson: z.string().describe('What trying these side by side would teach me about my taste. Empty if not useful.'),
  }),
  unreadable: z.string().describe('One short sentence on bottles or tags you could not read; empty if none.'),
});

// Keep the schema and the app's types in step.
const _check: z.infer<typeof ShelfSchema> extends ShelfReport ? true : never = true;
void _check;

function prompt(context: string, store: string, photos: number): string {
  return (
    `I'm standing in ${store || 'a wine store'} and took ${photos === 1 ? 'a photo' : `${photos} photos`} of the shelf. Help me choose.\n\n` +
    `${context}\n\n` +
    'Read every bottle whose label you can identify, with the price from its shelf tag (the tag below or beside it). ' +
    'If the same wine appears in several photos, list it once; if two vintages of the same wine are on the shelf, list both. ' +
    'Never invent a bottle, vintage or price you cannot actually see — leave the price 0 and mention it in "unreadable" instead.\n\n' +
    'Rank them for me, using my ratings and especially the words in my notes (e.g. if I wanted more tannin or less sweetness, say which bottles deliver that). ' +
    'Pick at most three as "top". Mark ones I should skip as "pass" with a clear reason. ' +
    'For price, say whether the shelf price is a bargain, fair or a little pricey for that bottle compared with what it usually sells for in the US, from what you know; use "unknown" rather than guess. ' +
    'Write like a knowledgeable friend: concise, specific, no filler.'
  );
}

async function toBase64Jpeg(photo: Blob): Promise<string> {
  // Claude reads images up to about 1568px on the long edge; more just costs more.
  const { blob } = await resizeImage(photo, 1568);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function reason(e: unknown): string | null {
  if (e instanceof Anthropic.AuthenticationError) return 'your Anthropic key was rejected — check it in My palate';
  if (e instanceof Anthropic.PermissionDeniedError) return 'your API key doesn’t have access to this model';
  if (e instanceof Anthropic.RateLimitError) return 'too many requests right now — try again in a moment';
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'it took too long — try fewer photos';
  if (e instanceof Anthropic.APIConnectionError) return 'no connection — this needs internet';
  if (e instanceof Anthropic.BadRequestError && /credit/i.test(e.message)) return 'your Anthropic account is out of credit (Plans & Billing at console.anthropic.com)';
  if (e instanceof Anthropic.APIError) return `Anthropic API error (${e.status ?? 'unknown'})`;
  return null;
}

export async function readShelfWithClaude(apiKey: string, photos: Blob[], context: string, store: string, signal?: AbortSignal): Promise<ShelfOutcome> {
  return readShelfImagesWithClaude(apiKey, await Promise.all(photos.map(toBase64Jpeg)), context, store, signal);
}

/** The same, with photos already as base64 JPEGs. */
export async function readShelfImagesWithClaude(apiKey: string, images: string[], context: string, store: string, signal?: AbortSignal): Promise<ShelfOutcome> {
  // Browser use is intentional: the key is the user's own and only ever sent to Anthropic.
  // No automatic retries: a retry would be billed twice.
  const client = claudeClient(apiKey, { maxRetries: 0, timeout: 300_000 });
  try {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...images.map((data, i) => [
        { type: 'text' as const, text: `Photo ${i + 1}:` },
        { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } },
      ]).flat(),
      { type: 'text', text: prompt(context, store, images.length) },
    ];
    const response = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(ShelfSchema) },
        messages: [{ role: 'user', content }],
      },
      { signal },
    );
    if (response.stop_reason === 'refusal') return { ok: false, reason: 'Claude couldn’t help with these photos' };
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) return { ok: false, reason: 'the answer was cut short — try fewer photos' };
    const report = response.parsed_output;
    report.bottles.sort((a, b) => a.rank - b.rank);
    return { ok: true, report };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const r = reason(e);
    if (r) return { ok: false, reason: r };
    throw e;
  }
}

const PriceSchema = z.object({
  checks: z.array(
    z.object({
      index: z.number(),
      price_call: z.enum(CALLS),
      note: z.string(),
      sources: z.array(z.string()),
    }),
  ),
});

const PRICE_TOOL = {
  name: 'report_prices',
  eager_input_streaming: true,
  description: 'Report the price check. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['checks'],
    properties: {
      checks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'price_call', 'note', 'sources'],
          properties: {
            index: { type: 'number', description: 'The bottle’s number from my list.' },
            price_call: { type: 'string', enum: [...CALLS], description: 'Shelf price vs current US retail you found.' },
            note: { type: 'string', description: 'Short, with numbers, e.g. "$79 here; $89–99 at most US shops — a good price".' },
            sources: { type: 'array', items: { type: 'string' }, description: 'Shop names whose prices you used.' },
          },
        },
      },
    },
  },
};

/** Look up current US prices online for a few bottles, to back up (or correct) the price calls. */
export async function checkPricesWithClaude(apiKey: string, report: ShelfReport, indexes: number[], signal?: AbortSignal): Promise<PriceCheckOutcome> {
  const client = claudeClient(apiKey, { maxRetries: 0, timeout: 600_000 });
  const list = indexes
    .map((i) => {
      const b = report.bottles[i];
      return `${i}. ${[b.producer, b.wine, b.vintage].filter(Boolean).join(' ')} — shelf price ${b.price_usd > 0 ? `$${b.price_usd}` : 'unknown'}`;
    })
    .join('\n');
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content:
        `Check current US retail prices for these wines (750ml) and say whether each shelf price is a bargain, fair or a little pricey:\n${list}\n\n` +
        'Search shops and price aggregators. Compare like with like (same vintage when possible). Use "unknown" if you find nothing reliable. Then call report_prices once.',
    },
  ];
  try {
    for (let turn = 0; turn < 5; turn++) {
      const res = await client.beta.messages
        .stream(
          {
            model: MODEL,
            max_tokens: 16000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'low' },
            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: Math.min(8, indexes.length * 2) }, PRICE_TOOL],
            messages,
          },
          { signal },
        )
        .finalMessage();
      const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'report_prices');
      if (call && call.type === 'tool_use') {
        const parsed = PriceSchema.safeParse(call.input);
        if (!parsed.success) return { ok: false, reason: 'the answer was incomplete' };
        return { ok: true, checks: parsed.data.checks.filter((c) => indexes.includes(c.index)) };
      }
      if (res.stop_reason === 'pause_turn' || res.stop_reason === 'end_turn') {
        messages.push({ role: 'assistant', content: res.content });
        if (res.stop_reason === 'end_turn') messages.push({ role: 'user', content: 'Please call report_prices now with what you found.' });
        continue;
      }
      return { ok: false, reason: `stopped early (${res.stop_reason ?? 'unknown'})` };
    }
    return { ok: false, reason: 'no answer' };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    if (e instanceof Anthropic.BadRequestError && /web search.*not enabled|not enabled.*web search/i.test(e.message)) {
      return { ok: false, reason: 'web search is switched off for your Anthropic account (Settings → Capabilities at console.anthropic.com)' };
    }
    const r = reason(e);
    if (r) return { ok: false, reason: r };
    throw e;
  }
}
