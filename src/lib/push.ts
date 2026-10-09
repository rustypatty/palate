import { SUPABASE_KEY } from './supabaseConfig';

/**
 * Price-drop alerts on this device (Web Push). The Monday check on Palate's server sends
 * them; this turns them on or off here. On iPhone they need Palate on the Home Screen.
 */

export type PushSupport = 'yes' | 'home-screen' | 'no';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'no';
  if ('PushManager' in window && 'Notification' in window) return 'yes';
  // Safari on iPhone only offers notifications to apps added to the Home Screen.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'home-screen' : 'no';
}

async function call(path: string, body?: unknown): Promise<Response> {
  const { accessToken, functionsUrl } = await import('./cloud');
  const token = await accessToken();
  if (!token) throw new Error('Sign in first');
  return fetch(`${functionsUrl('push')}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY ?? '', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** The service worker, if it's running (it isn't in development). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg?.active ? reg : null;
}

/** Are alerts on for this device? */
export async function pushEnabled(): Promise<boolean> {
  if (pushSupport() !== 'yes' || Notification.permission !== 'granted') return false;
  const reg = await registration();
  return Boolean(await reg?.pushManager.getSubscription());
}

const toBytes = (b64url: string) => {
  const raw = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Ask permission and subscribe this device. Must run from a tap. Returns an error to show, or null. */
export async function enablePush(): Promise<string | null> {
  if (pushSupport() !== 'yes') return 'This browser can’t show notifications.';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'Notifications are blocked for Palate. Allow them in your phone’s settings, then try again.';
  const reg = await registration();
  if (!reg) return 'Open Palate from your Home Screen and try again.';
  try {
    const res = await call('key');
    if (!res.ok) return 'Couldn’t reach Palate’s server.';
    const { key } = (await res.json()) as { key: string };
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) }));
    const saved = await call('subscribe', { subscription: sub.toJSON() });
    return saved.ok ? null : 'Couldn’t save this device on Palate’s server.';
  } catch (e) {
    return e instanceof Error ? e.message : 'Something went wrong.';
  }
}

export async function disablePush(): Promise<void> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return;
  await call('unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

/** Send a test alert to every device with alerts on. */
export async function sendTestPush(): Promise<boolean> {
  const res = await call('test', {}).catch(() => null);
  if (!res?.ok) return false;
  return ((await res.json()) as { sent?: number }).sent! > 0;
}
