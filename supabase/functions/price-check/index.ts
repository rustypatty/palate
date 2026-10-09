import { admin, cors, json, owner } from '../_shared/owner.ts';

/**
 * The Monday price check, run by pg_cron (see supabase/price_check_cron.sql) so it happens even
 * when the app isn't opened. Each run checks a few watched bottles not checked in the last few
 * days, which keeps every run short; the schedule repeats through Monday so all of them get done.
 * The prices land on the wines (priceHistory) and reach your devices with the next sync.
 *
 * Same search as the app's "Check now" (src/lib/priceCheckClient.ts): one Claude web search across
 * your stores, only keeping product pages that turned up in the search, the cheapest per bottle.
 */

const MODEL = 'claude-opus-5-5';
const PER_RUN = 4;
const RECHECK_MS = 3 * 24 * 3600 * 1000;
const KEEP_POINTS = 60;
const STORES = [
  { name: 'Total Wine', domain: 'totalwine.com' },
  { name: 'Whole Foods', domain: 'wholefoodsmarket.com' },
  { name: 'Twin Liquors', domain: 'twinliquors.com' },
  { name: 'Spec’s', domain: 'specsonline.com' },
  { name: 'Central Market', domain: 'centralmarket.com' },
];

interface PricePoint {
  date: string;
  price: number;
  store: string;
  url?: string;
}
interface Wine {
  id: string;
  producer?: string;
  name?: string;
  vintage?: number | null;
  region?: string;
  list?: string | null;
  rating?: string | null;
  watch?: boolean;
  priceHistory?: PricePoint[];
  updatedAt?: number;
}
interface Report {
  bottles: { n: number; offers: { url: string; price_usd: number }[] }[];
}

const canWatch = (w: Wine) => w.list === 'want' || (!w.list && w.rating === 'loved');

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u.trim());
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
}

function storeFor(u: string) {
  try {
    const host = new URL(u).hostname.replace(/^www\./, '').toLowerCase();
    return STORES.find((s) => host === s.domain || host.endsWith(`.${s.domain}`)) ?? null;
  } catch {
    return null;
  }
}

function prompt(wines: Wine[]): string {
  const stores = STORES.map((s) => `${s.name} (${s.domain})`).join(', ');
  const lines = wines.map((w, i) => {
    const last = w.priceHistory?.at(-1);
    return `${i + 1}. ${[w.producer, w.name, w.vintage ?? ''].filter(Boolean).join(' ')}${w.region ? ` (${w.region})` : ''}${last ? ` · last seen $${last.price} at ${last.store}` : ''}`;
  });
  return (
    `Check today's price of these wines at my stores: ${stores}.\n\n${lines.join('\n')}\n\n` +
    'Search the stores’ own websites (Total Wine first) for each exact wine, the same producer and cuvée; a different vintage is fine if it is the one on sale now. ' +
    'For each bottle, list every one of these stores whose product page for it appeared in your search results, with the exact URL and the price shown for a 750 ml bottle. ' +
    'Use as few searches as you can. Never invent a URL or price; leave a bottle’s offers empty if you found no page. Then call report_prices once.'
  );
}

const REPORT_TOOL = {
  name: 'report_prices',
  description: 'Report the prices found. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object',
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

// deno-lint-ignore no-explicit-any
type Block = any;

async function searchPrices(wines: Wine[]): Promise<{ report: Report | null; seen: Set<string>; note: string }> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return { report: null, seen: new Set(), note: 'no ANTHROPIC_API_KEY secret' };
  const messages: { role: string; content: unknown }[] = [{ role: 'user', content: prompt(wines) }];
  const seen = new Set<string>();
  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        fallbacks: 'default',
        output_config: { effort: 'low' },
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: Math.min(10, Math.max(3, wines.length)) }, REPORT_TOOL],
        messages,
      }),
    });
    if (!res.ok) return { report: null, seen, note: `Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const msg = await res.json();
    for (const block of msg.content as Block[]) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === 'web_search_result') seen.add(normalizeUrl(r.url));
      }
    }
    const call = (msg.content as Block[]).find((b) => b.type === 'tool_use' && b.name === 'report_prices');
    if (call) {
      const ok = Array.isArray(call.input?.bottles);
      return { report: ok ? (call.input as Report) : null, seen, note: ok ? '' : 'incomplete answer' };
    }
    if (msg.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: msg.content });
      continue;
    }
    if (msg.stop_reason === 'end_turn') {
      messages.push({ role: 'assistant', content: msg.content });
      messages.push({ role: 'user', content: 'Please call report_prices now with what you found.' });
      continue;
    }
    return { report: null, seen, note: `stopped early (${msg.stop_reason})` };
  }
  return { report: null, seen, note: 'no report' };
}

/** The cheapest offer per bottle, from your stores' sites and seen in the search. */
function cheapest(wines: Wine[], report: Report, seen: Set<string>, date: string): Map<string, PricePoint> {
  const out = new Map<string, PricePoint>();
  for (const b of report.bottles) {
    const wine = wines[b.n - 1];
    if (!wine) continue;
    for (const o of b.offers ?? []) {
      const store = storeFor(o.url);
      if (!store || !seen.has(normalizeUrl(o.url)) || !(o.price_usd > 0)) continue;
      const best = out.get(wine.id);
      if (!best || o.price_usd < best.price) out.set(wine.id, { date, price: o.price_usd, store: store.name, url: o.url });
    }
  }
  return out;
}

/** Add the price to the wine, as a fresh edit so every device picks it up. Skips a wine edited meanwhile. */
async function savePoint(userId: string, id: string, point: PricePoint): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: row } = await admin.from('wines').select('data, updated_at').eq('user_id', userId).eq('id', id).eq('deleted', false).maybeSingle();
    if (!row) return false;
    const now = Math.max(Date.now(), Number(row.updated_at) + 1);
    const wine = row.data as Wine;
    const data = { ...wine, priceHistory: [...(wine.priceHistory ?? []), point].slice(-KEEP_POINTS), updatedAt: now };
    const { data: done } = await admin.from('wines').update({ data, updated_at: now }).eq('user_id', userId).eq('id', id).eq('updated_at', row.updated_at).select('id');
    if (done?.length) return true;
  }
  return false;
}

async function run(): Promise<Record<string, unknown>> {
  const userId = await owner();
  if (!userId) return { skipped: 'no account' };
  const { data: user } = await admin.auth.admin.getUserById(userId);
  if (user.user?.user_metadata?.price_auto === false) return { skipped: 'auto-check is off' };
  const checked: Record<string, number> = { ...(user.user?.app_metadata?.price_checked ?? {}) };

  const { data: rows, error } = await admin.from('wines').select('id, data').eq('user_id', userId).eq('deleted', false);
  if (error) return { error: error.message };
  const now = Date.now();
  const watched = (rows ?? []).map((r) => ({ ...(r.data as Wine), id: r.id as string })).filter((w) => w.watch && canWatch(w));
  const due = watched.filter((w) => now - (checked[w.id] ?? 0) > RECHECK_MS).slice(0, PER_RUN);
  if (!due.length) return { watched: watched.length, due: 0 };

  const { report, seen, note } = await searchPrices(due);
  if (!report) return { watched: watched.length, due: due.length, error: note };
  const prices = cheapest(due, report, seen, new Date().toISOString());
  let saved = 0;
  for (const [id, point] of prices) if (await savePoint(userId, id, point)) saved++;

  // Remember what was checked (found or not), dropping bottles no longer watched.
  const ids = new Set(watched.map((w) => w.id));
  const next = Object.fromEntries(Object.entries(checked).filter(([id]) => ids.has(id)));
  for (const w of due) next[w.id] = now;
  await admin.auth.admin.updateUserById(userId, { app_metadata: { price_checked: next, price_checked_last: now } });
  return { watched: watched.length, due: due.length, found: prices.size, saved };
}

async function probe(): Promise<Record<string, unknown>> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return { key: false };
  const res = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'Hi' }] }),
  });
  return { key: true, accepted: res.ok, status: res.status };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // Only the scheduled job may run this: it sends a secret kept in the database's vault.
  const secret = req.headers.get('x-cron-secret') ?? '';
  const { data: allowed } = secret ? await admin.rpc('check_cron_secret', { s: secret }) : { data: false };
  if (allowed !== true) return json({ error: 'not allowed' }, 401);
  // {"probe": true}: is the Anthropic key set and accepted? Uses the free token counter, so costs nothing.
  if ((await req.json().catch(() => ({})))?.probe) return json(await probe());
  // Answer now and keep working: the scheduler doesn't wait for the search.
  const work = run()
    .then((r) => console.log('price-check', JSON.stringify(r)))
    .catch((e) => console.error('price-check failed', e instanceof Error ? e.message : e));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(work);
  return json({ started: true }, 202);
});
