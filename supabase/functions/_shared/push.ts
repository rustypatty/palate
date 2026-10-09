import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { admin } from './owner.ts';

/**
 * Phone notifications (Web Push). The signing keys are made on first use and kept in
 * public.server_keys, which only the server can read; devices that turn alerts on are
 * kept in public.push_subscriptions.
 */

// Push services may contact this address about problems; the app's own page.
const CONTACT = 'https://rustypatty.github.io/palate/';

let keys: Promise<CryptoKeyPair> | null = null;

function vapidKeys(): Promise<CryptoKeyPair> {
  keys ??= (async () => {
    const { data } = await admin.from('server_keys').select('value').eq('name', 'vapid').maybeSingle();
    if (data) return await webpush.importVapidKeys(data.value as webpush.ExportedVapidKeys);
    const fresh = await webpush.generateVapidKeys({ extractable: true });
    // Two first uses at once: keep whichever was saved first.
    await admin.from('server_keys').upsert({ name: 'vapid', value: await webpush.exportVapidKeys(fresh) }, { onConflict: 'name', ignoreDuplicates: true });
    const { data: saved } = await admin.from('server_keys').select('value').eq('name', 'vapid').single();
    return await webpush.importVapidKeys(saved!.value as webpush.ExportedVapidKeys);
  })().catch((e) => {
    keys = null;
    throw e;
  });
  return keys;
}

/** The public key a device needs to subscribe. */
export async function publicKey(): Promise<string> {
  return await webpush.exportApplicationServerKey(await vapidKeys());
}

export interface Note {
  title: string;
  body: string;
  /** Where tapping it opens, relative to the app, e.g. "#/watch". */
  url?: string;
  tag?: string;
}

/** Send to every device that turned alerts on. Devices that unsubscribed are forgotten. */
export async function notify(userId: string, note: Note): Promise<{ sent: number; failed: number }> {
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, subscription').eq('user_id', userId);
  if (!subs?.length) return { sent: 0, failed: 0 };
  const server = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys: await vapidKeys() });
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    try {
      await server.subscribe(s.subscription as webpush.PushSubscription).pushTextMessage(JSON.stringify(note), { ttl: 3 * 24 * 3600 });
      sent++;
    } catch (e) {
      failed++;
      if (e instanceof webpush.PushMessageError && e.isGone()) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else console.error('push failed', e instanceof Error ? e.message : e);
    }
  }
  return { sent, failed };
}
