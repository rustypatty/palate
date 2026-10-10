import { signedInClient } from './cloud';

/**
 * The connect key for the Palate Chrome extension: it lets the extension save Total Wine pages
 * to your account without signing in there. Only its SHA-256 hash is stored; making a new key
 * retires the old one.
 */

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function newConnectKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `pk_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

/** A fresh key (shown once), replacing any earlier one; null when signed out. */
export async function makeConnectKey(): Promise<string | null> {
  const sb = await signedInClient();
  if (!sb) return null;
  const key = newConnectKey();
  // Your own keys only (row-level security): the old one stops working.
  const old = await sb.from('import_keys').delete().neq('key_hash', '');
  if (old.error) throw new Error(old.error.message);
  const { error } = await sb.from('import_keys').insert({ key_hash: await sha256Hex(key) });
  if (error) throw new Error(error.message);
  return key;
}
