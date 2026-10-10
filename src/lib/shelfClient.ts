import Anthropic from '@anthropic-ai/sdk';
import { claudeClient } from './claude';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { resizeImage } from './image';
import { loadProfile } from './profile';
import { completeItems, shelfBudget, withinBudget, type PriceCheckOutcome, type ShelfBottle, type ShelfOutcome, type ShelfProgress, type ShelfReport } from './shelf';

const MODEL = 'claude-opus-5-5';

const STYLES = ['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified', 'unknown'] as const;
const CALLS = ['bargain', 'fair', 'pricey', 'unknown'] as const;

// Kept short on purpose: everything here is shown, and every word written is time spent waiting in the aisle.
const Where = z.string().describe('Where it is: photo number and a visual cue, e.g. "Photo 1, blue label". Under 8 words.');
const Deal = z.string().describe('A sale or mix-6 price exactly as printed on its tag, e.g. "$40.49 in a mix of 6" or "Sale $59.97, was $79.97". Empty if none.');
const Score = z.string().describe('A critic score exactly as printed on its tag, e.g. "95 James Suckling". Empty if the tag shows none. Never from memory.');
const Price = z.number().describe('Single-bottle price on its tag; 0 if you cannot read it.');

const PickSchema = z.object({
  producer: z.string(),
  wine: z.string().describe('Cuvée, vineyard or appellation as on the label.'),
  vintage: z.string().describe('Year as printed, "NV", or empty if not visible.'),
  region: z.string(),
  country: z.string(),
  grapes: z.array(z.string()).describe('Main grapes, from the label or what the appellation requires; empty if unsure.'),
  style: z.enum(STYLES),
  price_usd: Price,
  deal: Deal,
  score: Score,
  where: Where,
  taste: z.array(z.string()).describe('3–4 short tasting tags, e.g. "Dark cherry", "Tobacco", "Firm tannins".'),
  why: z.string().describe('Why it suits me, under 30 words, naming a wine I rated or words from my notes.'),
  price_call: z.enum(CALLS).describe('Shelf price vs what it usually sells for in the US; "unknown" if no price or not confident.'),
  tip: z.string().describe('One practical tip under 12 words (e.g. which vintage to grab, decanting), or empty.'),
});

const AlsoSchema = z.object({
  producer: z.string(),
  wine: z.string(),
  vintage: z.string(),
  region: z.string(),
  country: z.string(),
  style: z.enum(STYLES),
  price_usd: Price,
  deal: Deal,
  score: Score,
  where: Where,
  line: z.string().describe('Why it is worth a look, under 15 words.'),
});

// Picks first, so they can be shown while the rest is still being written.
const ShelfSchema = z.object({
  picks: z.array(PickSchema).describe('The 3–5 best buys for me here, best first.'),
  also_good: z.array(AlsoSchema).describe('Up to 6 more worth a look. Leave out anything I should skip.'),
  decision: z.string().describe('The call, under 35 words: "If you get one: <wine>." plus one alternative for a budget, tonight, or exploring.'),
  lesson: z.string().describe('One sentence (under 25 words) on what trying the picks side by side would teach me. Empty if nothing useful.'),
  unreadable: z.string().describe('Under 20 words on tags you could not read; empty if none.'),
});
// The structured-output schema without the SDK's own parser: a cut-off answer is handled here, not thrown.
const { type: FORMAT_TYPE, schema: FORMAT_SCHEMA } = betaZodOutputFormat(ShelfSchema);

const pickToBottle = (p: z.infer<typeof PickSchema>): ShelfBottle => ({ ...p, verdict: 'top' });
const alsoToBottle = ({ line, ...a }: z.infer<typeof AlsoSchema>): ShelfBottle => ({ ...a, grapes: [], verdict: 'good', taste: [], why: line, price_call: 'unknown', tip: '' });

function prompt(context: string, store: string, photos: number, lookingFor: string, budget: number | null): string {
  return (
    `I'm in ${store || 'a wine store'} and took ${photos === 1 ? 'a photo' : `${photos} photos`} of the shelf. Help me choose what to buy.\n\n` +
    `${context}\n\n` +
    (lookingFor.trim() ? `What I'm looking for: ${lookingFor.trim()}\n\n` : '') +
    (budget ? `My budget: up to $${budget} a bottle. Only suggest bottles whose single-bottle tag price is at or under that. Always copy the tag price exactly, even when it is over.\n\n` : '') +
    'Read the bottles and match each to the price tag directly below or beside it. Only consider bottles you can identify, and skip any marked out of stock. ' +
    'If the same wine is in several photos, list it once. Never invent a bottle, vintage, price or score — use scores only as printed on tags. ' +
    'Pick the 3–5 best buys for me, then up to 6 more worth a look. Do not mention bottles I should skip. ' +
    'Be brief and specific: short words, no filler.'
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

export async function readShelfWithClaude(
  apiKey: string,
  photos: Blob[],
  context: string,
  store: string,
  lookingFor = '',
  onProgress?: (p: ShelfProgress) => void,
  signal?: AbortSignal,
): Promise<ShelfOutcome> {
  return readShelfImagesWithClaude(apiKey, await Promise.all(photos.map(toBase64Jpeg)), context, store, lookingFor, onProgress, signal);
}

/** The same, with photos already as base64 JPEGs. */
export async function readShelfImagesWithClaude(
  apiKey: string,
  images: string[],
  context: string,
  store: string,
  lookingFor = '',
  onProgress?: (p: ShelfProgress) => void,
  signal?: AbortSignal,
): Promise<ShelfOutcome> {
  // Browser use is intentional: the key is the user's own and only ever sent to Anthropic.
  // No automatic retries: a retry would be billed twice.
  const client = claudeClient(apiKey, { maxRetries: 0, timeout: 300_000 });
  const budget = shelfBudget(lookingFor, loadProfile()?.budget ?? null);
  try {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...images.map((data, i) => [
        { type: 'text' as const, text: `Photo ${i + 1}:` },
        { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } },
      ]).flat(),
      { type: 'text', text: prompt(context, store, images.length, lookingFor, budget) },
    ];
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // Low effort: on 5 Total Wine photos the first pick showed at ~5s and all at ~18s (vs ~26s / 43s at medium), with the same prices read.
        output_config: { effort: 'low', format: { type: FORMAT_TYPE, schema: FORMAT_SCHEMA } },
        messages: [{ role: 'user', content }],
      },
      { signal },
    );
    let text = '';
    let shown = 0;
    stream.on('text', (delta) => {
      text += delta;
      if (!onProgress) return;
      const picks = completeItems(text, 'picks').flatMap((x) => {
        const p = PickSchema.safeParse(x);
        return p.success ? [pickToBottle(p.data)] : [];
      });
      const also = completeItems(text, 'also_good').flatMap((x) => {
        const p = AlsoSchema.safeParse(x);
        return p.success ? [alsoToBottle(p.data)] : [];
      });
      const bottles = withinBudget([...picks, ...also], budget);
      if (bottles.length > shown) {
        shown = bottles.length;
        onProgress({ bottles });
      }
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === 'refusal') return { ok: false, reason: 'Claude couldn’t help with these photos' };
    if (response.stop_reason === 'max_tokens') return { ok: false, reason: 'the answer was cut short — try fewer photos' };
    const body = response.content.find((b) => b.type === 'text');
    let json: unknown = null;
    try {
      json = JSON.parse(body?.type === 'text' ? body.text : '');
    } catch {
      /* handled below */
    }
    const parsed = ShelfSchema.safeParse(json);
    if (!parsed.success) return { ok: false, reason: 'the answer was incomplete — try again' };
    const r = parsed.data;
    return {
      ok: true,
      report: {
        decision: r.decision,
        lesson: r.lesson,
        bottles: withinBudget([...r.picks.map(pickToBottle), ...r.also_good.map(alsoToBottle)], budget),
        unreadable: r.unreadable,
      },
    };
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
