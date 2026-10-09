import { admin, cors, json, ownerFromRequest } from '../_shared/owner.ts';
import { notify, publicKey } from '../_shared/push.ts';

/**
 * Turning price-drop alerts on and off for a device (signed in as the owner).
 *   GET  /push/key          the public key a device subscribes with
 *   POST /push/subscribe    { subscription }  remember this device
 *   POST /push/unsubscribe  { endpoint }      forget it
 *   POST /push/test         send a test alert to every device
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const userId = await ownerFromRequest(req);
  if (!userId) return json({ error: 'not allowed' }, 403);
  const action = new URL(req.url).pathname.split('/').filter(Boolean).at(-1);
  try {
    if (req.method === 'GET' && action === 'key') return json({ key: await publicKey() });
    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await req.json().catch(() => ({}));
    if (action === 'subscribe') {
      const sub = body.subscription;
      if (typeof sub?.endpoint !== 'string' || !sub?.keys?.p256dh || !sub?.keys?.auth) return json({ error: 'bad subscription' }, 400);
      const { error } = await admin.from('push_subscriptions').upsert({ endpoint: sub.endpoint, user_id: userId, subscription: sub });
      return error ? json({ error: error.message }, 500) : json({ ok: true });
    }
    if (action === 'unsubscribe') {
      if (typeof body.endpoint === 'string') await admin.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', body.endpoint);
      return json({ ok: true });
    }
    if (action === 'test') {
      return json(await notify(userId, { title: 'Palate', body: 'Price alerts are on. You’ll hear from me when a bottle you watch gets cheaper.', url: '#/watch', tag: 'test' }));
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'failed' }, 500);
  }
});
