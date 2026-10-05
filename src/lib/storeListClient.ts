import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Store, StoreList, SuggestedItem } from './stores';

const MODEL = 'claude-opus-5-5';

export interface StoreListRequest {
  store: Store;
  /** Plain-language taste summary. */
  taste: string[];
  loved: string[];
  liked: string[];
  disliked: string[];
  /** Wines already in the collection or marked "Not for me" — don't suggest these. */
  skip: string[];
  budget: number | null;
}

export type StoreListOutcome = { ok: true; list: StoreList } | { ok: false; reason: string };

const STYLES = ['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified'] as const;

const REPORT_TOOL = {
  name: 'report_store_list',
  eager_input_streaming: true,
  description: 'Report the suggestions. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['picks', 'tips'],
    properties: {
      picks: {
        type: 'array',
        description: 'Specific bottles, each with a product page on the store’s website that appeared in your search results.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['producer', 'wine', 'vintage', 'region', 'country', 'grapes', 'style', 'price_usd', 'url', 'reason'],
          properties: {
            producer: { type: 'string' },
            wine: { type: 'string', description: 'Cuvée or wine name as the store lists it.' },
            vintage: { type: 'string', description: 'Year, "NV", or empty if not shown.' },
            region: { type: 'string', description: 'Appellation or region.' },
            country: { type: 'string' },
            grapes: { type: 'array', items: { type: 'string' }, description: 'As listed by the store; empty if not listed.' },
            style: { type: 'string', enum: [...STYLES] },
            price_usd: { type: 'number', description: 'Price shown on the store page; 0 if not shown.' },
            url: { type: 'string', description: 'The exact product page URL from your search results.' },
            reason: { type: 'string', description: 'One short line tying it to a wine they rated, e.g. "Like the Clos Saint Michel you loved: Grenache-based, similar price".' },
          },
        },
      },
      tips: {
        type: 'array',
        items: { type: 'string' },
        description: '2–4 short tips: which section, appellations or producers to look for at this store. Name producers or styles, never a specific bottle you could not find a page for.',
      },
    },
  },
};

const ReportSchema = z.object({
  picks: z.array(
    z.object({
      producer: z.string(),
      wine: z.string(),
      vintage: z.string(),
      region: z.string(),
      country: z.string(),
      grapes: z.array(z.string()),
      style: z.enum(STYLES),
      price_usd: z.number(),
      url: z.string(),
      reason: z.string(),
    }),
  ),
  tips: z.array(z.string()),
});

export { normalizeUrl } from './likeThis';
import { normalizeUrl } from './likeThis';

/**
 * Turn Claude's report into what the app shows: a bottle is a pick only if its page
 * is on the store's site and actually appeared in the search results. Anything else
 * becomes a "look for this producer" tip, so no invented bottle is ever shown.
 */
export function verifyReport(report: z.infer<typeof ReportSchema>, store: Store, seen: Set<string>, budget: number | null): StoreList {
  const picks: SuggestedItem[] = [];
  const tips = [...report.tips];
  for (const p of report.picks) {
    const norm = normalizeUrl(p.url);
    const onStore = norm.startsWith(store.domain) || norm.includes(`.${store.domain}`);
    const title = [p.producer, p.wine, p.vintage].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!onStore || !seen.has(norm) || !p.producer || !p.wine) {
      if (p.producer) tips.push(`Look for ${p.producer}${p.region ? ` (${p.region})` : ''}.`);
      continue;
    }
    const price = p.price_usd > 0 ? p.price_usd : null;
    if (budget !== null && price !== null && price > budget) continue;
    if (picks.some((x) => normalizeUrl(x.url) === norm)) continue;
    picks.push({
      key: `${store.id}:${norm}`,
      title,
      style: p.style,
      price,
      context: [p.region, p.country, ...p.grapes].join(' '),
      url: p.url,
      image: null, // never a lookalike: the user can add a real photo later
      vintage: /^\d{4}$/.test(p.vintage) ? Number(p.vintage) : p.vintage === 'NV' ? 'NV' : null,
      country: p.country,
      sizeMl: null,
      producer: p.producer,
      wine: p.wine,
      region: p.region,
      grapes: p.grapes,
      claudeReason: p.reason,
    });
  }
  return { picks, tips: [...new Set(tips)].slice(0, 6), budget };
}

function prompt(r: StoreListRequest): string {
  const list = (label: string, xs: string[], max = 15) => (xs.length ? `${label}: ${xs.slice(0, max).join('; ')}\n` : '');
  return (
    `Help me choose wine at ${r.store.name} (${r.store.domain}).\n\n` +
    `My taste, worked out from my own ratings:\n${r.taste.join(' ') || '(not much rated yet)'}\n` +
    list('Wines I loved', r.loved) +
    list('Wines I liked', r.liked) +
    list('Wines I would not buy again', r.disliked) +
    list('Already had, saved or not interested — do not suggest', r.skip, 40) +
    (r.budget ? `Only suggest bottles at or under $${r.budget}.\n` : '') +
    `\nSearch ${r.store.domain} for 8–10 specific bottles this store sells that I am likely to enjoy and have not had. ` +
    'Only list a bottle as a pick if one of your search results is its product page on that site, and copy that exact URL. ' +
    'Never invent a bottle, cuvée or URL. If you think a producer or style would suit me but did not find its page, put it in tips instead. ' +
    'Give each pick one short reason tied to a wine I rated. Also add 2–4 tips on which sections, appellations or producers to look for there. ' +
    'Then call report_store_list once.'
  );
}

export async function findStoreListWithClaude(
  apiKey: string,
  req: StoreListRequest,
  signal?: AbortSignal,
  /** Sees each raw response; used by the live test script to show what Claude searched and reported. */
  onResponse?: (res: Anthropic.Beta.BetaMessage) => void,
): Promise<StoreListOutcome> {
  // No automatic retries (a retry is billed twice); searching can take a minute or two.
  const client = new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com', dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 600_000 });
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
            tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6, allowed_domains: [req.store.domain] }, REPORT_TOOL],
            messages,
          },
          { signal },
        )
        .finalMessage();
      onResponse?.(res);
      // Remember every page the search actually returned: picks must come from these.
      for (const block of res.content) {
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === 'web_search_result') seen.add(normalizeUrl(r.url));
        }
      }
      const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'report_store_list');
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
        messages.push({ role: 'user', content: 'Please call report_store_list now with what you found.' });
        continue;
      }
      stopNote = `stopped early (${res.stop_reason ?? 'unknown'})`;
      break;
    }
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError && /web search.*not enabled|not enabled.*web search/i.test(e.message)) {
      return { ok: false, reason: 'web search is switched off for your Anthropic account (Settings → Capabilities at console.anthropic.com)' };
    }
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, reason: 'your Anthropic key was rejected — check it in My palate' };
    if (e instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: 'it took too long' };
    if (e instanceof Anthropic.APIUserAbortError) return { ok: false, reason: 'cancelled' };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, reason: 'lost connection (check your signal)' };
    if (e instanceof Anthropic.APIError) return { ok: false, reason: `Anthropic error ${e.status ?? ''}: ${e.message}`.slice(0, 300) };
    throw e;
  }
  if (!report) return { ok: false, reason: stopNote || 'Claude didn’t report a result' };
  return { ok: true, list: verifyReport(report, req.store, seen, req.budget) };
}
