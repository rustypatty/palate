import Anthropic from '@anthropic-ai/sdk';
import { claudeClient } from './claude';
import { z } from 'zod';
import type { PricePoint, Wine } from '../types';
import { normalizeUrl, SEARCH_STORES, storeForDomain } from './likeThis';
import { latestPrice } from './priceWatch';
import { storeById } from './stores';

const MODEL = 'claude-opus-5-5';

export interface CheckUsage {
  inputTokens: number;
  outputTokens: number;
  searches: number;
}

export type CheckOutcome =
  | { ok: true; at: number; prices: Map<string, PricePoint>; usage: CheckUsage }
  | { ok: false; reason: string };

const REPORT_TOOL = {
  name: 'report_prices',
  eager_input_streaming: true,
  description: 'Report the prices found. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['bottles'],
    properties: {
      bottles: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['n', 'offers'],
          properties: {
            n: { type: 'integer', description: 'The bottle’s number from the list.' },
            offers: {
              type: 'array',
              description: 'Each store product page for this exact wine that appeared in your search results.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['url', 'price_usd'],
                properties: {
                  url: { type: 'string', description: 'Exact product page URL from your search results.' },
                  price_usd: { type: 'number', description: 'Price shown for a 750 ml bottle; 0 if not shown.' },
                },
              },
            },
          },
        },
      },
    },
  },
};

const ReportSchema = z.object({
  bottles: z.array(z.object({ n: z.number(), offers: z.array(z.object({ url: z.string(), price_usd: z.number() })) })),
});

function describe(w: Wine, n: number): string {
  const last = latestPrice(w);
  return `${n}. ${[w.producer, w.name, w.vintage ?? ''].filter(Boolean).join(' ')}${w.region ? ` (${w.region})` : ''}${last ? ` · last seen $${last.price} at ${last.store}` : ''}`;
}

export function priceCheckPrompt(wines: Wine[]): string {
  const stores = SEARCH_STORES.map((s) => `${s.name} (${s.domain})`).join(', ');
  return (
    `Check today's price of these wines at my stores: ${stores}.\n\n${wines.map((w, i) => describe(w, i + 1)).join('\n')}\n\n` +
    'Search the stores’ own websites (Total Wine first) for each exact wine, the same producer and cuvée; a different vintage is fine if it is the one on sale now. ' +
    'For each bottle, list every one of these stores whose product page for it appeared in your search results, with the exact URL and the price shown for a 750 ml bottle. ' +
    'Use as few searches as you can. Never invent a URL or price; leave a bottle’s offers empty if you found no page. Then call report_prices once.'
  );
}

/**
 * Keep offers whose page is on one of the stores' sites and turned up in the search,
 * and take the cheapest per bottle.
 */
export function cheapestVerified(wines: Wine[], report: z.infer<typeof ReportSchema>, seen: Set<string>, at: number): Map<string, PricePoint> {
  const out = new Map<string, PricePoint>();
  for (const b of report.bottles) {
    const wine = wines[b.n - 1];
    if (!wine) continue;
    for (const o of b.offers) {
      const storeId = storeForDomain(o.url);
      if (!storeId || storeById(storeId).kind !== 'search' || !seen.has(normalizeUrl(o.url)) || !(o.price_usd > 0)) continue;
      const best = out.get(wine.id);
      if (!best || o.price_usd < best.price) out.set(wine.id, { date: new Date(at).toISOString(), price: o.price_usd, store: storeById(storeId).name, url: o.url });
    }
  }
  return out;
}

/** One search for every watched bottle's current price at your stores. */
export async function checkPricesWithClaude(apiKey: string, wines: Wine[], signal?: AbortSignal): Promise<CheckOutcome> {
  // No automatic retries (a retry is billed twice). Always Anthropic's own address.
  const client = claudeClient(apiKey, { maxRetries: 0, timeout: 600_000 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: priceCheckPrompt(wines) }];
  const seen = new Set<string>();
  const usage: CheckUsage = { inputTokens: 0, outputTokens: 0, searches: 0 };
  let report: z.infer<typeof ReportSchema> | null = null;
  let stopNote = '';
  try {
    for (let turn = 0; turn < 6 && !report; turn++) {
      const res = await client.beta.messages
        .stream(
          {
            model: MODEL,
            max_tokens: 8000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'low' },
            // About one search per bottle, never more than 10 in a check.
            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: Math.min(10, Math.max(3, wines.length)) }, REPORT_TOOL],
            messages,
          },
          { signal },
        )
        .finalMessage();
      usage.inputTokens += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
      usage.outputTokens += res.usage.output_tokens;
      usage.searches += res.usage.server_tool_use?.web_search_requests ?? 0;
      for (const block of res.content) {
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === 'web_search_result') seen.add(normalizeUrl(r.url));
        }
      }
      const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'report_prices');
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
        messages.push({ role: 'user', content: 'Please call report_prices now with what you found.' });
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
  const at = Date.now();
  return { ok: true, at, prices: cheapestVerified(wines, report, seen, at), usage };
}
