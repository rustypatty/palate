import { useSyncExternalStore } from 'react';
import { SUPABASE_KEY } from './supabaseConfig';

/**
 * Your Anthropic key can live on Palate's server (a Supabase secret) instead of on each device.
 * Signed in, the app checks once whether it's there; if so, Claude requests go through the
 * server, which adds the key. A key saved on this device still takes precedence.
 */

const FLAG = 'palate.serverKey';
/** Stands in for a key when the server holds the real one. */
export const SERVER_KEY = 'palate:server-key';

export function serverKeyReady(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

function setReady(ready: boolean) {
  try {
    localStorage.setItem(FLAG, ready ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event('palate:serverKey'));
}

/** Ask the server whether it holds a key for you. Offline or signed out: no change / not ready. */
export async function checkServerKey(): Promise<boolean> {
  const { accessToken, functionsUrl } = await import('./cloud');
  const token = await accessToken().catch(() => null);
  if (!token) {
    setReady(false);
    return false;
  }
  try {
    const res = await fetch(`${functionsUrl('claude')}/status`, { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY ?? '' } });
    const ready = res.ok && Boolean(((await res.json()) as { ready?: boolean }).ready);
    setReady(ready);
    return ready;
  } catch {
    return serverKeyReady();
  }
}

/** Whether the server holds your key, kept current as you sign in and out. */
export function useServerKey(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('palate:serverKey', onChange);
      return () => window.removeEventListener('palate:serverKey', onChange);
    },
    serverKeyReady,
  );
}
