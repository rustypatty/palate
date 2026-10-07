import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { resizeImage } from './image';
import { listAsText, type AskOutcome, type ListAnswer, type ListWine, type ReadListOutcome, type SavedList } from './wineList';

const MODEL = 'claude-opus-5-5';
const STYLES = ['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified', 'unknown'] as const;

const ListSchema = z.object({
  wines: z.array(
    z.object({
      section: z.string().describe('The heading this wine is listed under on the menu, e.g. "Burgundy", "Pauillac", "Rest of the world".'),
      producer: z.string().describe('Winery / producer / château as printed.'),
      wine: z.string().describe('Cuvée, vineyard or appellation, e.g. "Pommard Les Argillières". Empty if only the producer is given.'),
      vintage: z.string().describe('Year as printed, "NV", or empty if none.'),
      region: z.string().describe('Most specific region or appellation, from the entry or its section.'),
      country: z.string(),
      grapes: z.array(z.string()).describe('Main grapes: printed, or what the appellation requires (red Burgundy = Pinot Noir). Empty if unsure.'),
      style: z.enum(STYLES),
      price: z.number().describe('Bottle price as printed; 0 if none.'),
      glass_price: z.number().describe('By-the-glass price if listed; 0 if none.'),
    }),
  ),
  unreadable: z.string().describe('One short sentence about entries or prices you could not read (glare, shadow, cut off); empty if none.'),
});

const AnswerSchema = z.object({
  reply: z.string().describe('Your answer in plain words, 2–6 short paragraphs. Refer to wines by name and price. No markdown headings.'),
  picks: z
    .array(
      z.object({
        n: z.number().describe('The wine’s number on the list.'),
        why: z.string().describe('Why it suits me, comparing it by name with wines I rated, and what it will taste like. 2–3 sentences, under 70 words.'),
        tag: z.enum(['match', 'value', 'new', '']).describe('"match" = best palate match, "value" = best value, "new" = good way to learn something new; at most one of each.'),
      }),
    )
    .describe('The wines you recommend for this question, best first, at most 5. Empty if the question is not asking for recommendations.'),
  tip: z.string().describe('Optional one- or two-sentence lesson worth remembering (e.g. which appellations give structured Pinot). Empty if none.'),
});

// Keep the schemas and the app's types in step.
const _a: z.infer<typeof ListSchema>['wines'][number] extends ListWine ? true : never = true;
const _b: z.infer<typeof AnswerSchema> extends ListAnswer ? true : never = true;
void _a;
void _b;

async function toBase64Jpeg(photo: Blob): Promise<string> {
  // Menu text is small: keep the full resolution Claude reads (about 1568px on the long edge).
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
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'it took too long — try fewer pages';
  if (e instanceof Anthropic.APIConnectionError) return 'no connection — this needs internet';
  if (e instanceof Anthropic.BadRequestError && /credit/i.test(e.message)) return 'your Anthropic account is out of credit (Plans & Billing at console.anthropic.com)';
  if (e instanceof Anthropic.APIError) return `Anthropic API error (${e.status ?? 'unknown'})`;
  return null;
}

// Browser use is intentional: the key is the user's own and only ever sent to Anthropic.
// No automatic retries: a retry would be billed twice.
const clientFor = (apiKey: string) =>
  new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com', dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 300_000 });

export async function readWineListWithClaude(apiKey: string, photos: Blob[], signal?: AbortSignal): Promise<ReadListOutcome> {
  const client = clientFor(apiKey);
  try {
    const images = await Promise.all(photos.map(toBase64Jpeg));
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...images.flatMap((data, i) => [
        { type: 'text' as const, text: `Page ${i + 1}:` },
        { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } },
      ]),
      {
        type: 'text',
        text:
          'These are photos of a restaurant’s wine list. Write out every wine on it, in the order listed, with its section heading and price. ' +
          'Prices sit at the end of the dotted line on the same row; read them carefully. If a page appears twice, list its wines once. ' +
          'Never invent a wine, vintage or price you cannot actually read — leave it empty or 0 and mention it in "unreadable".',
      },
    ];
    const res = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: betaZodOutputFormat(ListSchema) },
        messages: [{ role: 'user', content }],
      },
      { signal },
    );
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'Claude couldn’t help with these photos' };
    if (res.stop_reason === 'max_tokens' || !res.parsed_output) return { ok: false, reason: 'the list was too long to read in one go — try fewer pages' };
    return { ok: true, wines: res.parsed_output.wines, unreadable: res.parsed_output.unreadable };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const r = reason(e);
    if (r) return { ok: false, reason: r };
    throw e;
  }
}

/** An earlier answer as plain text, so the conversation reads naturally to Claude. */
function answerText(a: ListAnswer, wines: ListWine[]): string {
  const picks = a.picks
    .map((p) => {
      const w = wines[p.n - 1];
      return w ? `- #${p.n} ${[w.producer, w.wine, w.vintage].filter(Boolean).join(' ')}${w.price ? ` ($${w.price})` : ''}: ${p.why}` : '';
    })
    .filter(Boolean)
    .join('\n');
  return [a.reply, picks && `Picks:\n${picks}`, a.tip].filter(Boolean).join('\n\n');
}

export async function askWineListWithClaude(apiKey: string, list: SavedList, question: string, context: string, signal?: AbortSignal): Promise<AskOutcome> {
  const client = clientFor(apiKey);
  const system =
    'You are a knowledgeable friend helping me order wine at a restaurant from its list. ' +
    'Recommend for my palate, using my ratings and especially the words in my notes, and say how each pick compares with wines I know. ' +
    'Mind the price I give; restaurant prices are usually 2–4× retail, so call out a bottle that is unusually good value for this list. ' +
    'Only recommend wines that are on the list, by their number. Be concise, specific and honest about trade-offs; no filler.\n\n' +
    `${context}\n\nThe wine list (number. wine — price):\n${listAsText(list.wines)}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const t of list.turns) {
    if (!t.a) continue;
    messages.push({ role: 'user', content: t.q }, { role: 'assistant', content: answerText(t.a, list.wines) });
  }
  messages.push({ role: 'user', content: question });
  try {
    const res = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        output_config: { effort: 'medium', format: betaZodOutputFormat(AnswerSchema) },
        messages,
      },
      { signal },
    );
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'Claude couldn’t answer that' };
    if (res.stop_reason === 'max_tokens' || !res.parsed_output) return { ok: false, reason: 'the answer was cut short — try again' };
    const answer = res.parsed_output;
    answer.picks = answer.picks.filter((p) => p.n >= 1 && p.n <= list.wines.length).slice(0, 5);
    return { ok: true, answer };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const r = reason(e);
    if (r) return { ok: false, reason: r };
    throw e;
  }
}
