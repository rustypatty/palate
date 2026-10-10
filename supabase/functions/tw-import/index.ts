import { admin, cors, json, owner } from '../_shared/owner.ts';
import { checkImport, mapProduct } from '../_shared/totalwine.ts';

/**
 * POST /tw-import from the Palate Chrome extension: the bottles on the Total Wine page the
 * user is looking at, with their store's stock. The extension has no sign-in of its own, so
 * it sends the connect key made in the app (header x-palate-key); only its hash is stored.
 */

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'not found' }, 404);

  const key = (req.headers.get('x-palate-key') ?? '').trim();
  if (!/^pk_[A-Za-z0-9_-]{20,80}$/.test(key)) return json({ error: 'Add your connect key from Palate (My palate → Total Wine import).' }, 401);
  const hash = await sha256(key);
  const { data: row } = await admin.from('import_keys').select('user_id').eq('key_hash', hash).maybeSingle();
  if (!row || row.user_id !== (await owner())) return json({ error: 'That connect key isn’t valid any more. Make a new one in Palate.' }, 401);

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
