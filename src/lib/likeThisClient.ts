import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { LikeThisCache, Wine } from '../types';
import { pagePreviewImage, relayedImageUrl } from './labelClient';
import { normalizeUrl, photoMatches, SEARCH_STORES, storeForDomain, verifyBottles, type ReportedBottle } from './likeThis';

const MODEL = 'claude-opus-5-5';
const STYLES = ['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified'] as const;

export interface LikeRequest {
  wine: Wine;
  taste: string[];
  loved: string[];
  disliked: string[];
  skip: string[];
}

export type LikeOutcome = { ok: true; cache: LikeThisCache } | { ok: false; reason: string };

const REPORT_TOOL = {
  name: 'report_bottles',
  eager_input_streaming: true,
  description: 'Report the bottles found. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['bottles', 'tips'],
    properties: {
      bottles: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['producer', 'wine', 'vintage', 'region', 'country', 'grapes', 'style', 'offers', 'photo_page_url', 'reason'],
          properties: {
            producer: { type: 'string' },
            wine: { type: 'string', description: 'Cuvée or wine name as the store lists it.' },
            vintage: { type: 'string', description: 'Year, "NV", or empty.' },
            region: { type: 'string' },
            country: { type: 'string' },
            grapes: { type: 'array', items: { type: 'string' }, description: 'As listed; empty if not listed.' },
            style: { type: 'string', enum: [...STYLES] },
            offers: {
              type: 'array',
              description: 'Each store product page for this bottle that appeared in your search results.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['url', 'price_usd'],
                properties: {
                  url: { type: 'string', description: 'Exact product page URL from your search results.' },
                  price_usd: { type: 'number', description: 'Price shown for it; 0 if not shown.' },
                },
              },
            },
            photo_page_url: {
              type: 'string',
              description: 'A product page for this same producer and cuvée on another wine shop (not one of the stores above, not wine.com/vivino/wine-searcher), from your search results; empty if none.',
            },
            reason: { type: 'string', description: 'One short line on why it is like the wine they enjoyed.' },
          },
        },
      },
      tips: { type: 'array', items: { type: 'string' }, description: '1–3 short tips: producers or appellations like this to look for. Never a bottle you found no page for.' },
    },
  },
};

const ReportSchema = z.object({
  bottles: z.array(
    z.object({
      producer: z.string(),
      wine: z.string(),
      vintage: z.string(),
      region: z.string(),
      country: z.string(),
      grapes: z.array(z.string()),
      style: z.enum(STYLES),
      offers: z.array(z.object({ url: z.string(), price_usd: z.number() })),
      photo_page_url: z.string(),
      reason: z.string(),
    }),
  ),
  tips: z.array(z.string()),
});

function describe(w: Wine): string {
  return [
    [w.producer, w.name, w.vintage ?? ''].filter(Boolean).join(' '),
    [w.region, w.country].filter(Boolean).join(', '),
    w.grapes.length ? `grapes: ${w.grapes.join(', ')}` : '',
    w.style ?? '',
    w.price !== null ? `about $${w.price}` : '',
    w.rating === 'loved' ? 'I loved it' : w.rating === 'liked' ? 'I liked it' : '',
    w.notes ? `my notes: ${w.notes.slice(0, 300)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function prompt(r: LikeRequest): string {
  const stores = SEARCH_STORES.map((s) => `${s.name} (${s.domain})`).join(', ');
  const list = (label: string, xs: string[], max = 15) => (xs.length ? `${label}: ${xs.slice(0, max).join('; ')}\n` : '');
  return (
    `Find bottles like this wine that I can buy at my stores.\n\nThe wine: ${describe(r.wine)}\n\n` +
    `My taste, from my own ratings: ${r.taste.join(' ') || '(not much rated yet)'}\n` +
    list('Wines I loved', r.loved) +
    list('Wines I would not buy again', r.disliked) +
    list('Already had, saved or not interested — do not suggest', r.skip, 40) +
    `\nMy stores: ${stores}. Search Total Wine first, then the others. Find 6–10 specific bottles similar to this wine (same appellation or nearby, similar grapes and style, similar price) that these stores sell. ` +
    'For each bottle, list every one of these stores whose product page for it appeared in your search results, with the exact URL and the price shown. ' +
    'Never invent a bottle, URL or price. If a producer would suit me but you found no store page, put it in tips instead. ' +
    'Where you can, also give a product page for the same producer and cuvée on another wine shop (for its bottle photo). ' +
    'Then call report_bottles once.'
  );
}

export async function findLikeThisWithClaude(apiKey: string, req: LikeRequest, signal?: AbortSignal): Promise<LikeOutcome> {
  // No automatic retries (a retry is billed twice).
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 600_000 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt(req) }];
  const seen = new Set<string>();
  let report: z.infer<typeof ReportSchema> | null = null;
  let stopNote = '';
  try {
    for (let turn = 0; turn < 6 && !report; turn++) {
      const res = await client.beta.messages
        .stream(
          {
            model: MODEL,
            max_tokens: 16000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'low' },
            tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }, REPORT_TOOL],
            messages,
          },
          { signal },
        )
        .finalMessage();
      for (const block of res.content) {
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === 'web_search_result') seen.add(normalizeUrl(r.url));
        }
      }
      const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'report_bottles');
      if (call && call.type === 'tool_use') {
        const parsed = ReportSchema.safeParse(call.input);
        if (parsed.success) report = parsed.data;
        else stopNote = 'Claude’s answer was incomplete';
        break;
      }
      if (res.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: res.content });
        continue;
      }
      if (res.stop_reason === 'end_turn') {
        messages.push({ role: 'assistant', content: res.content });
        messages.push({ role: 'user', content: 'Please call report_bottles now with what you found.' });
        continue;
      }
      stopNote = `stopped early (${res.stop_reason ?? 'unknown'})`;
      break;
    }
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError && /web search.*not enabled|not enabled.*web search/i.test(e.message)) {
      return { ok: false, reason: 'web search is switched off for your Anthropic account' };
    }
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, reason: 'your Anthropic key was rejected — check it in My palate' };
    if (e instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: 'it took too long' };
    if (e instanceof Anthropic.APIUserAbortError) return { ok: false, reason: 'cancelled' };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, reason: 'lost connection (check your signal)' };
    if (e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && e.status === 529)) {
      return { ok: false, reason: 'Anthropic is busy right now — try again in a minute' };
    }
    if (e instanceof Anthropic.APIError) return { ok: false, reason: `Anthropic error ${e.status ?? ''}: ${e.message}`.slice(0, 300) };
    throw e;
  }
  if (!report) return { ok: false, reason: stopNote || 'Claude didn’t report a result' };

  const { bottles, tips } = verifyBottles(report.bottles as ReportedBottle[], seen);
  // Photos: the other shop's page must have turned up in the search, and its title must
  // name this producer and cuvée — otherwise keep the placeholder.
  await Promise.all(
    bottles.map(async (b) => {
      const src = report!.bottles.find((r) => r.producer === b.producer && r.wine === b.wine);
      const page = src?.photo_page_url ?? '';
      if (!/^https:\/\//.test(page) || !seen.has(normalizeUrl(page))) return;
      const img = await pagePreviewImage(page, signal);
      if (!img || !photoMatches(b, img.title)) return;
      b.image = { url: relayedImageUrl(img.url), pageUrl: page, siteName: new URL(page).hostname.replace(/^www\./, '') };
    }),
  );
  // What was covered: store pages the search turned up, and confirmed bottles per store.
  const pages = [...seen].filter((u) => storeForDomain(`https://${u}`)).length;
  const byStore: Record<string, number> = {};
  for (const b of bottles) for (const o of b.offers) byStore[o.storeId] = (byStore[o.storeId] ?? 0) + 1;
  // Claude's own tips first, then producers it named without a confirmed store page.
  return {
    ok: true,
    cache: { at: Date.now(), bottles, tips: [...report.tips, ...tips].slice(0, 5), checked: { pages, suggested: report.bottles.length, byStore } },
  };
}
