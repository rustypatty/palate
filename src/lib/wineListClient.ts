import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { partialParse } from '@anthropic-ai/sdk/_vendor/partial-json-parser/parser';
import { z } from 'zod';
import { resizeImage } from './image';
import {
  cleanSections,
  listAsText,
  liveAnswer,
  sectionTitle,
  VALUE_LINE,
  type AskOutcome,
  type ListAnswer,
  type ListWine,
  type ReadListOutcome,
  type SavedList,
} from './wineList';

const MODEL = 'claude-opus-5-5';
const STYLES = ['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified', 'unknown'] as const;

// Only what's printed, one short line per wine and each heading once: Claude writes about
// 100 words a second, so every word saved here is time saved at the table. Grapes, region
// and style are filled in later for the picks alone.
const ListSchema = z.object({
  sections: z.array(
    z.object({
      name: z.string().describe('The heading on the menu, e.g. "Burgundy" or "Italian Reds Flight".'),
      wines: z
        .array(z.string())
        .describe('One line per wine: "producer | rest of the entry as printed | vintage | glass price | bottle price". Keep hints like "(Napa)". Vintage as a year ("\'20" is 2020), "NV" or empty. Prices as plain numbers, empty if none.'),
    }),
  ),
  unreadable: z.string().describe('One short sentence about entries or prices you could not read (glare, shadow, cut off); empty if none.'),
});

/** "Scarpa | Barbaresco | 2020 | 18 | 85" → a wine on the list. */
export function lineToWine(section: string, line: string): ListWine | null {
  const [producer = '', wine = '', vintage = '', glass = '', bottle = ''] = line.split('|').map((x) => x.trim());
  if (!producer && !wine) return null;
  const price = (x: string) => {
    const n = parseFloat(x.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  return { section, producer, wine, vintage, region: '', country: '', grapes: [], style: 'unknown', price: price(bottle), glass_price: price(glass) };
}

/** What a picked wine is: the menu rarely says, so the pick fills it in. */
const DETAILS = {
  region: z.string().describe('Most specific region or appellation.'),
  country: z.string(),
  grapes: z.array(z.string()).describe('Main grapes. Empty if unsure.'),
  style: z.enum(STYLES),
};

const AnswerSchema = z.object({
  reply: z.string().describe('Your answer in plain words, 2–6 short paragraphs. Refer to wines by name and price. No markdown headings.'),
  picks: z
    .array(
      z.object({
        n: z.number().describe('The wine’s number on the list.'),
        why: z.string().describe('Why it suits me, comparing it by name with wines I rated, and what it will taste like. 2–3 sentences, under 70 words.'),
        tag: z.enum(['match', 'value', 'new', '']).describe('"match" = best palate match, "value" = best value, "new" = good way to learn something new; at most one of each.'),
        ...DETAILS,
      }),
    )
    .describe('The wines you recommend for this question, best first, at most 5. Empty if the question is not asking for recommendations.'),
  tip: z.string().describe('Optional one- or two-sentence lesson worth remembering (e.g. which appellations give structured Pinot). Empty if none.'),
});

const OverviewSchema = z.object({
  reply: z.string().describe('A short overview of the list for me: 2–3 short paragraphs on what it is strong in, where my kind of wine is, and what to skip. Refer to wines by name and price. No markdown headings.'),
  sections: z
    .array(
      z.object({
        kind: z.enum(['match', 'value', 'new', 'glass']),
        picks: z
          .array(
            z.object({
              n: z.number().describe('The wine’s number on the list.'),
              why: z.string().describe('Why it suits me, comparing it by name with wines I rated, and what it will taste like. 1–2 sentences, under 45 words.'),
              ...DETAILS,
            }),
          )
          .describe('Best first, at most 3.'),
      }),
    )
    .describe('One entry for each kind asked for.'),
  tip: z.string().describe('Optional one- or two-sentence lesson worth remembering. Empty if none.'),
});

type PickOut = { n: number; why: string; tag?: '' | 'match' | 'value' | 'new'; region: string; country: string; grapes: string[]; style: ListWine['style'] };
const pickFrom = ({ n, why, tag, ...details }: PickOut) => ({ n, why, tag: tag ?? ('' as const), details });

/** Timings and token counts of the last request, for the live speed tests. */
export const lastRun = { firstTextMs: 0, totalMs: 0, usage: null as Anthropic.Beta.BetaUsage | null };

/** Stream a structured answer, reporting what's written so far, and return the parsed whole. */
async function streamParsed<T>(
  client: Anthropic,
  params: Parameters<Anthropic['beta']['messages']['stream']>[0],
  signal: AbortSignal | undefined,
  onPartial?: (partial: unknown) => void,
): Promise<{ stop: string | null; parsed: T | null }> {
  const t0 = Date.now();
  lastRun.firstTextMs = 0;
  const stream = client.beta.messages.stream(params, { signal });
  stream.on('text', (_delta, snapshot) => {
    if (!lastRun.firstTextMs) lastRun.firstTextMs = Date.now() - t0;
    if (!onPartial) return;
    try {
      onPartial(partialParse(snapshot));
    } catch {
      /* not parseable yet */
    }
  });
  const res = await stream.finalMessage();
  lastRun.totalMs = Date.now() - t0;
  lastRun.usage = res.usage;
  return { stop: res.stop_reason, parsed: (res as { parsed_output?: T | null }).parsed_output ?? null };
}

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

export async function readWineListWithClaude(apiKey: string, photos: Blob[], signal?: AbortSignal, onProgress?: (wines: number) => void): Promise<ReadListOutcome> {
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
          'These are photos of a restaurant’s wine list. Copy out every wine on it, in the order listed, with its section heading and prices — only what is printed. ' +
          'Prices sit at the end of the line on the same row; read them carefully. If a page appears twice, list its wines once. ' +
          'Never invent a wine, vintage or price you cannot actually read — leave it empty or 0 and mention it in "unreadable".',
      },
    ];
    let seen = 0;
    const { stop, parsed } = await streamParsed<z.infer<typeof ListSchema>>(
      client,
      {
        model: MODEL,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: betaZodOutputFormat(ListSchema) },
        messages: [{ role: 'user', content }],
      },
      signal,
      onProgress &&
        ((partial) => {
          const secs = (partial as { sections?: { wines?: unknown[] }[] })?.sections;
          const n = Array.isArray(secs) ? secs.reduce((t, x) => t + (Array.isArray(x?.wines) ? x.wines.length : 0), 0) : 0;
          if (n !== seen) onProgress((seen = n));
        }),
    );
    if (stop === 'refusal') return { ok: false, reason: 'Claude couldn’t help with these photos' };
    if (stop === 'max_tokens' || !parsed) return { ok: false, reason: 'the list was too long to read in one go — try fewer pages' };
    const wines = parsed.sections.flatMap((x) => x.wines.map((l) => lineToWine(x.name, l)).filter((w): w is ListWine => w !== null));
    return { ok: true, wines, unreadable: parsed.unreadable };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const r = reason(e);
    if (r) return { ok: false, reason: r };
    throw e;
  }
}

/** An earlier answer as plain text, so the conversation reads naturally to Claude. */
function answerText(a: ListAnswer, wines: ListWine[]): string {
  const lines = (picks: ListAnswer['picks']) =>
    picks
      .map((p) => {
        const w = wines[p.n - 1];
        return w ? `- #${p.n} ${[w.producer, w.wine, w.vintage].filter(Boolean).join(' ')}${w.price ? ` ($${w.price})` : ''}: ${p.why}` : '';
      })
      .filter(Boolean)
      .join('\n');
  const picks = lines(a.picks);
  const sections = (a.sections ?? []).map((s) => `${sectionTitle(s.kind, null)}:\n${lines(s.picks)}`);
  return [a.reply, picks && `Picks:\n${picks}`, ...sections, a.tip].filter(Boolean).join('\n\n');
}

function systemFor(list: SavedList, context: string): string {
  return (
    'You are a knowledgeable friend helping me order wine at a restaurant from its list. ' +
    'Recommend for my palate, using my ratings and especially the words in my notes, and say how each pick compares with wines I know. ' +
    'Mind the price I give; restaurant prices are usually 2–4× retail, so call out a bottle that is unusually good value for this list. ' +
    'Only recommend wines that are on the list, by their number. Be concise, specific and honest about trade-offs; no filler.\n\n' +
    `${context}\n\nThe wine list (number. wine — price):\n${listAsText(list.wines)}`
  );
}

/** Right after a list is read: an overview, and the best picks for me, best value, something new and by the glass, in one go. */
export async function overviewWineListWithClaude(
  apiKey: string,
  list: SavedList,
  context: string,
  budget: number | null,
  signal?: AbortSignal,
  onPartial?: (a: ListAnswer) => void,
): Promise<AskOutcome> {
  const client = clientFor(apiKey);
  const glass = list.wines.some((w) => w.glass_price > 0);
  const kinds = [
    '"match": the best wines on the list for my palate, at any price unless I gave a budget',
    `"value": the best value for me under $${budget ?? VALUE_LINE} a bottle`,
    '"new": good ways to learn something new that I would probably still like',
    ...(glass ? ['"glass": the best by-the-glass choices for me (only wines with a glass price)'] : []),
  ];
  const question =
    `Give me an overview of this list, then up to 3 picks for each of these:\n${kinds.map((k) => `- ${k}`).join('\n')}\n` +
    'A wine can appear in more than one section if it truly belongs there, but prefer variety.';
  try {
    const { stop, parsed: o } = await streamParsed<z.infer<typeof OverviewSchema>>(
      client,
      {
        model: MODEL,
        max_tokens: 10000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: systemFor(list, context),
        output_config: { effort: 'medium', format: betaZodOutputFormat(OverviewSchema) },
        messages: [{ role: 'user', content: question }],
      },
      signal,
      onPartial && ((p) => { const a = liveAnswer(p); if (a) onPartial(a); }),
    );
    if (stop === 'refusal') return { ok: false, reason: 'Claude couldn’t answer that' };
    if (stop === 'max_tokens' || !o) return { ok: false, reason: 'the answer was cut short — try again' };
    const sections = cleanSections(
      o.sections.map((s) => ({ kind: s.kind, picks: s.picks.map(pickFrom) })),
      list.wines,
    );
    return { ok: true, answer: { reply: o.reply, picks: [], sections, tip: o.tip } };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const r = reason(e);
    if (r) return { ok: false, reason: r };
    throw e;
  }
}

export async function askWineListWithClaude(
  apiKey: string,
  list: SavedList,
  question: string,
  context: string,
  signal?: AbortSignal,
  onPartial?: (a: ListAnswer) => void,
): Promise<AskOutcome> {
  const client = clientFor(apiKey);
  const system = systemFor(list, context);
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const t of list.turns) {
    if (!t.a) continue;
    messages.push({ role: 'user', content: t.q || 'Give me an overview of this list and your picks.' }, { role: 'assistant', content: answerText(t.a, list.wines) });
  }
  messages.push({ role: 'user', content: question });
  try {
    const { stop, parsed } = await streamParsed<z.infer<typeof AnswerSchema>>(
      client,
      {
        model: MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        output_config: { effort: 'medium', format: betaZodOutputFormat(AnswerSchema) },
        messages,
      },
      signal,
      onPartial && ((p) => { const a = liveAnswer(p); if (a) onPartial(a); }),
    );
    if (stop === 'refusal') return { ok: false, reason: 'Claude couldn’t answer that' };
    if (stop === 'max_tokens' || !parsed) return { ok: false, reason: 'the answer was cut short — try again' };
    const picks = parsed.picks.map(pickFrom).filter((p) => p.n >= 1 && p.n <= list.wines.length).slice(0, 5);
    return { ok: true, answer: { reply: parsed.reply, picks, tip: parsed.tip } };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    const r = reason(e);
    if (r) return { ok: false, reason: r };
    throw e;
  }
}
