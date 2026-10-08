import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from '../db';
import type { Wine } from '../types';
import { syncOnce, type Remote, type RemoteRow } from './sync';
import { SUPABASE_KEY, SUPABASE_URL } from './supabaseConfig';

/**
 * Online storage (Supabase): sign in once per device with an emailed link,
 * then wines and photos sync in the background whenever something changes,
 * the app is opened or comes back to the foreground.
 */

const URL_ = SUPABASE_URL;
const KEY = SUPABASE_KEY;
export const cloudConfigured = Boolean(URL_ && KEY);

export type CloudStatus =
  | { state: 'off' }
  | { state: 'signed-out'; message?: string }
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

let listening = false;
let pendingLink: { access_token: string; refresh_token: string } | { error: string } | null = null;

/**
 * The sign-in email's link comes back as …/#access_token=…&refresh_token=… (or #error=…).
 * Take it out of the address before the app's router sees it. Call before rendering.
 */
export function captureSignInLink() {
  if (!listening) {
    // Also when the link lands in a tab that already has Palate open (no reload).
    listening = true;
    window.addEventListener('hashchange', () => {
      captureSignInLink();
      if (pendingLink && clientPromise) void clientPromise.then(applySignInLink);
    });
  }
  const hash = window.location.hash.slice(1);
  if (!/(^|&)(access_token|error_description)=/.test(hash)) return;
  const p = new URLSearchParams(hash);
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  if (access_token && refresh_token) pendingLink = { access_token, refresh_token };
  else {
    const code = p.get('error_code') ?? '';
    pendingLink = {
      error: /expired|invalid/i.test(`${code} ${p.get('error_description')}`)
        ? 'That sign-in link has expired or was already used. Send a new one.'
        : (p.get('error_description') ?? 'That sign-in link didn’t work. Send a new one.').replace(/\+/g, ' '),
    };
  }
  // Same page, new #route: no reload, and the router is told (unlike history.replaceState).
  window.location.replace(`${window.location.pathname}${window.location.search}#/profile`);
}

let clientPromise: Promise<SupabaseClient> | null = null;
function client(): Promise<SupabaseClient> {
  if (!cloudConfigured) throw new Error('Online storage isn’t set up.');
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_!, KEY!, {
      // Stay signed in on this device. Sign-in links are picked up by captureSignInLink
      // (the app's own #/routes would otherwise swallow the tokens in the URL).
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'implicit', storageKey: 'palate.auth' },
    }),
  );
  return clientPromise;
}

/** The signed-in user's access token, for Palate's own server functions (null when signed out). */
export async function accessToken(): Promise<string | null> {
  if (!cloudConfigured) return null;
  const { data } = await (await client()).auth.getSession();
  return data.session?.access_token ?? null;
}

/** Address of one of Palate's server functions, e.g. "claude". */
export const functionsUrl = (name: string) => `${URL_}/functions/v1/${name}`;

/** Settings kept with your account so Palate's server can see them (e.g. the weekly price check). */
export async function saveAccountSetting(key: string, value: unknown): Promise<void> {
  if (!cloudConfigured) return;
  const sb = await client();
  const { data } = await sb.auth.getSession();
  if (data.session) await sb.auth.updateUser({ data: { [key]: value } });
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

/** Sign in with the captured link, if any. True when there was one. */
async function applySignInLink(sb: SupabaseClient): Promise<boolean> {
  const link = pendingLink;
  pendingLink = null;
  if (!link) return false;
  if ('error' in link) {
    setStatus({ state: 'signed-out', message: link.error });
    return true;
  }
  // Success fires SIGNED_IN, which starts the sync.
  const { error } = await sb.auth.setSession(link);
  if (error) setStatus({ state: 'signed-out', message: 'That sign-in link didn’t work. Send a new one.' });
  return true;
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
  void client().then(async (sb) => {
    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        void syncNow();
        void import('./serverKey').then((m) => m.checkServerKey());
      }
      if (event === 'SIGNED_OUT') {
        setStatus({ state: 'signed-out' });
        void import('./serverKey').then((m) => m.checkServerKey());
      }
    });
    if (!(await applySignInLink(sb))) void syncNow();
    void import('./serverKey').then((m) => m.checkServerKey());
  });
}

/** Email a sign-in link that brings the user back to this page, signed in. */
export async function sendLink(email: string): Promise<string | null> {
  try {
    const sb = await client();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    if (!error) return null;
    if (/rate limit|security purposes/i.test(error.message)) return 'Too many emails requested. Wait a few minutes and try again.';
    if (/signups not allowed/i.test(error.message)) return 'That email isn’t allowed to sign in here.';
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
