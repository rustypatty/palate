import { admin, cors, json, owner } from '../_shared/owner.ts';
import { checkImport, mapProduct, sourceUrl } from '../_shared/totalwine.ts';

/**
 * The Palate Chrome extension's server side. The extension has no sign-in of its own, so it sends
 * the connect key made in the app (header x-palate-key); only its hash is stored.
 *   POST /tw-import           the bottles on one Total Wine page, with their store's stock
 *   POST /tw-import/claim     the next refresh job to work on (supabase/totalwine_refresh.sql), or none
 *   POST /tw-import/progress  { jobId, nextPage, totalPages, saved, inStock, status?, message? }
 */

const STALE_MS = 15 * 60 * 1000;

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hand out one job: a queued one, or a running one that went quiet (Chrome closed mid-way), which carries on. */
async function claim() {
  const now = new Date();
  // Not started within 12 hours, or not finished within a day: dropped, so nothing runs at an odd time.
  await admin.from('tw_jobs').update({ status: 'expired', finished_at: now.toISOString() }).eq('status', 'queued').lt('expires_at', now.toISOString());
  await admin
    .from('tw_jobs')
    .update({ status: 'expired', finished_at: now.toISOString() })
    .in('status', ['running', 'needs_you'])
    .lt('created_at', new Date(now.getTime() - 24 * 3600 * 1000).toISOString());
  const { data } = await admin
    .from('tw_jobs')
    .select('id, kind, status, next_page, total_pages, saved, in_stock, heartbeat_at, tw_sources(url, store_id)')
    .in('status', ['queued', 'running', 'needs_you'])
    .order('created_at')
    .limit(10);
  // A job waiting on a Total Wine check is the extension's to carry on; after an hour it's handed out again.
  const quiet = (j: { status: string; heartbeat_at: string | null }) =>
    !j.heartbeat_at || now.getTime() - Date.parse(j.heartbeat_at) > (j.status === 'needs_you' ? 60 * 60 * 1000 : STALE_MS);
  const job = (data ?? []).find((j) => j.status === 'queued' || quiet(j));
  if (!job) return null;
  const { data: taken } = await admin
    .from('tw_jobs')
    .update({ status: 'running', heartbeat_at: now.toISOString() })
    .eq('id', job.id)
    .eq('status', job.status)
    .select('id')
    .maybeSingle();
  if (!taken) return null;
  const source = job.tw_sources as unknown as { url: string; store_id: string };
  return { id: job.id, kind: job.kind, url: source.url, storeId: source.store_id, nextPage: job.next_page, totalPages: job.total_pages, saved: job.saved, inStock: job.in_stock };
}

const STATUSES = ['running', 'needs_you', 'done', 'failed'];
const int = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.round(x) : null);

async function progress(body: Record<string, unknown>) {
  if (typeof body.jobId !== 'string') return json({ error: 'no job' }, 400);
  const status = typeof body.status === 'string' && STATUSES.includes(body.status) ? body.status : 'running';
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, heartbeat_at: now, message: typeof body.message === 'string' ? body.message.slice(0, 300) : '' };
  for (const [k, col] of [['nextPage', 'next_page'], ['totalPages', 'total_pages'], ['saved', 'saved'], ['inStock', 'in_stock']] as const) {
    const v = int(body[k]);
    if (v !== null) patch[col] = v;
  }
  if (status === 'done' || status === 'failed') patch.finished_at = now;
  const { error } = await admin.from('tw_jobs').update(patch).eq('id', body.jobId).in('status', ['running', 'needs_you']);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'not found' }, 404);

  const key = (req.headers.get('x-palate-key') ?? '').trim();
  if (!/^pk_[A-Za-z0-9_-]{20,80}$/.test(key)) return json({ error: 'Add your connect key from Palate (My palate → Total Wine import).' }, 401);
  const hash = await sha256(key);
  const { data: row } = await admin.from('import_keys').select('user_id').eq('key_hash', hash).maybeSingle();
  if (!row || row.user_id !== (await owner())) return json({ error: 'That connect key isn’t valid any more. Make a new one in Palate.' }, 401);

  const action = new URL(req.url).pathname.split('/').filter(Boolean).at(-1);
  if (action === 'claim') return json({ job: await claim() });
  if (action === 'progress') return progress((await req.json().catch(() => ({}))) as Record<string, unknown>);

  const checked = checkImport(await req.json().catch(() => null));
  if (!checked.ok) return json({ error: checked.error }, 400);
  const { payload, origin } = checked;
  const store = payload.store;
  const now = new Date().toISOString();

  const mapped = payload.products.map((p) => mapProduct(p, origin));
  // One row per product even if a page lists a bottle twice.
  const products = [...new Map(mapped.map((m) => [m.product.product_id, { ...m.product, updated_at: now }])).values()];
  const stock = [...new Map(mapped.map((m) => [m.check.product_id, { ...m.check, store_id: store.id, checked_at: now }])).values()];
  const strip = <T extends { retailer?: string }>({ retailer: _r, ...rest }: T) => rest;

  const p = await admin.from('tw_products').upsert(products.map(strip));
  if (p.error) return json({ error: p.error.message }, 500);
  const s = await admin.from('tw_stock').upsert(stock.map(strip));
  if (s.error) return json({ error: s.error.message }, 500);
  await admin.from('tw_stores').upsert({ store_id: store.id, name: store.name.slice(0, 120), city: (store.city ?? '').slice(0, 80), imported_at: now });
  // Remember the list, so the weekly refresh covers it.
  await admin.from('tw_sources').upsert({ store_id: store.id, url: sourceUrl(payload.pageUrl), last_imported_at: now }, { onConflict: 'store_id,url' });
  await admin.from('import_keys').update({ last_used_at: now }).eq('key_hash', hash);

  return json({
    ok: true,
    store: store.name,
    saved: products.length,
    inStock: stock.filter((x) => x.status === 'in_stock' || x.status === 'limited').length,
    page: payload.pagination?.page ?? null,
    totalPages: payload.pagination?.totalPages ?? null,
  });
});
