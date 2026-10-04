import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from '../db';
import type { Wine } from '../types';
import { syncOnce, type Remote, type RemoteRow } from './sync';

/**
 * Online storage (Supabase): sign in once per device with an emailed code,
 * then wines and photos sync in the background whenever something changes,
 * the app is opened or comes back to the foreground.
 */

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudConfigured = Boolean(URL_ && KEY);

export type CloudStatus =
  | { state: 'off' }
  | { state: 'signed-out' }
  | { state: 'syncing'; email: string; lastSyncedAt: number | null }
  | { state: 'synced'; email: string; lastSyncedAt: number }
  | { state: 'error'; email: string; lastSyncedAt: number | null; message: string };

let status: CloudStatus = cloudConfigured ? { state: 'signed-out' } : { state: 'off' };
const listeners = new Set<() => void>();
function setStatus(s: CloudStatus) {
  status = s;
  listeners.forEach((l) => l());
}
export const cloudStatus = {
  get: () => status,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

let clientPromise: Promise<SupabaseClient> | null = null;
function client(): Promise<SupabaseClient> {
  if (!cloudConfigured) throw new Error('Online storage isn’t set up.');
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_!, KEY!, {
      // Stay signed in on this device; codes are typed in, not links, so ignore the URL.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'palate.auth' },
    }),
  );
  return clientPromise;
}

function supabaseRemote(sb: SupabaseClient, userId: string): Remote {
  const path = (id: string) => `${userId}/${id}`;
  const check = <T>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
    if (error) throw new Error(error.message);
    return data as T;
  };
  return {
    async list() {
      const out: { id: string; updated_at: number; deleted: boolean }[] = [];
      // Page through: the API returns at most 1000 rows per request.
      for (let from = 0; ; from += 1000) {
        const page = check(await sb.from('wines').select('id, updated_at, deleted').order('id').range(from, from + 999)) ?? [];
        out.push(...page.map((r) => ({ ...r, updated_at: Number(r.updated_at) })));
        if (page.length < 1000) return out;
      }
    },
    async fetch(ids) {
      const out: RemoteRow[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const rows = check(await sb.from('wines').select('id, updated_at, deleted, data').in('id', ids.slice(i, i + 100))) ?? [];
        out.push(...rows.map((r) => ({ ...r, updated_at: Number(r.updated_at), data: r.data as Wine })));
      }
      return out;
    },
    async upsert(rows) {
      for (let i = 0; i < rows.length; i += 200) {
        check(await sb.from('wines').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,id' }));
      }
    },
    async uploadPhoto(id, blob) {
      check(await sb.storage.from('photos').upload(path(id), blob, { upsert: true, contentType: blob.type || 'image/jpeg' }));
    },
    async downloadPhoto(id) {
      const { data, error } = await sb.storage.from('photos').download(path(id));
      return error ? null : data;
    },
  };
}

function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|network|load failed/i.test(m)) return 'No connection — will sync when you’re back online.';
  if (/relation .*wines.* does not exist|could not find the table/i.test(m)) return 'The online database isn’t set up yet (run setup.sql in Supabase).';
  if (/bucket not found/i.test(m)) return 'The photo storage isn’t set up yet (run setup.sql in Supabase).';
  return m;
}

let running: Promise<void> | null = null;
let again = false;

/** Sync now (or right after the sync already running). */
export function syncNow(): Promise<void> {
  if (!cloudConfigured) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await runSync();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function runSync() {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) {
    setStatus({ state: 'signed-out' });
    return;
  }
  const email = user.email ?? '';
  const last = 'lastSyncedAt' in status ? status.lastSyncedAt : null;
  setStatus({ state: 'syncing', email, lastSyncedAt: last });
  try {
    await syncOnce(supabaseRemote(sb, user.id));
    setStatus({ state: 'synced', email, lastSyncedAt: Date.now() });
  } catch (e) {
    setStatus({ state: 'error', email, lastSyncedAt: last, message: friendly(e) });
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleSync(ms = 1500) {
  // Sync's own writes land here too; that costs one extra, empty check at most.
  if (status.state === 'off' || status.state === 'signed-out') return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

/** Start background syncing. Call once at startup. */
export function startCloud() {
  if (!cloudConfigured) return;
  // Any local change → sync shortly after.
  const changed = () => scheduleSync();
  db.wines.hook('creating', changed);
  db.wines.hook('updating', changed);
  db.wines.hook('deleting', changed);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleSync(300));
  window.addEventListener('online', () => scheduleSync(300));
  // Pick up changes from other devices while the app stays open.
  setInterval(() => document.visibilityState === 'visible' && scheduleSync(0), 3 * 60_000);
  void client().then((sb) => {
    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') void syncNow();
      if (event === 'SIGNED_OUT') setStatus({ state: 'signed-out' });
    });
    void syncNow();
  });
}

export async function sendCode(email: string): Promise<string | null> {
  try {
    const sb = await client();
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (!error) return null;
    if (/rate limit|security purposes/i.test(error.message)) return 'Too many codes requested. Wait a minute and try again.';
    if (/signups not allowed/i.test(error.message)) return 'That email isn’t allowed to sign in here.';
    return error.message;
  } catch (e) {
    return friendly(e);
  }
}

export async function verifyCode(email: string, code: string): Promise<string | null> {
  try {
    const sb = await client();
    const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
    if (!error) return null;
    if (/expired|invalid/i.test(error.message)) return 'That code didn’t work. Check it, or send a new one.';
    return error.message;
  } catch (e) {
    return friendly(e);
  }
}

export async function signOut() {
  const sb = await client();
  await sb.auth.signOut({ scope: 'local' });
  setStatus({ state: 'signed-out' });
}
