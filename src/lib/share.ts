import type { Wine, WineStyle } from '../types';
import { SUPABASE_KEY, SUPABASE_URL } from './supabaseConfig';

/**
 * Sharing your Loved wines: a read-only page at <app>/loved/ (share/ and loved/index.html) that
 * anyone with the link can open. The app publishes a snapshot (supabase/share.sql) when you tap
 * Share or Update; Stop sharing deletes it. A snapshot holds only what a friend should see: the
 * wine, a photo, and Palate's description of it. Never your own notes, prices or bottle counts.
 */

export const SHARE_SLUG = 'loved';
/** Whose list it is, in the page title: "Rusty's loved wines". */
export const SHARE_NAME = 'Rusty';

/** Taste tags for people new to wine, in plain words. */
export const SHARE_TAGS = ['Light & silky', 'Bright & juicy', 'Warm & spicy', 'Bold & rich', 'Crisp & fresh', 'Rich & creamy', 'Bubbly', 'Sweet'] as const;
export type ShareTag = (typeof SHARE_TAGS)[number];

/** The friendly bits on the page: a taste tag, one plain sentence, and foods to try it with. */
export interface ShareBlurb {
  tag: ShareTag;
  /** Empty when Claude couldn't write one (the tag then comes from the grapes). */
  line: string;
  pairing: string;
}

export interface SharedWine {
  /** The wine's id in Palate, to reuse its photo copy on the next Update. */
  id: string;
  producer: string;
  name: string;
  vintage: number | 'NV' | null;
  region: string;
  country: string;
  grapes: string[];
  style: WineStyle | null;
  photo: string | null;
  /** Palate's description (what it is, how it tastes), when the wine has one. */
  about: { whatItIs: string; taste: string } | null;
  /** Lists shared before tags were added have none until the next Update. */
  blurb?: ShareBlurb;
  /** The broader, better-known area: "Burgundy" for Mercurey (from the appellation guide), else empty. */
  area?: string;
}

export interface SharedList {
  name: string;
  wines: SharedWine[];
  /** Photo copies in the public bucket, by the local photo they were made from. */
  photos: Record<string, string>;
  sharedAt: number;
}

/** The wines you'd share: the ones you loved, most recently rated first. */
export function lovedToShare(wines: Wine[]): Wine[] {
  return wines.filter((w) => w.rating === 'loved' && !w.list && (w.producer || w.name)).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** One wine as a friend sees it. `photo` is the shareable photo address, worked out by the caller. */
export function sharedWine(w: Wine, photo: string | null): SharedWine {
  const t = w.take;
  const about = t && (t.whatItIs.trim() || t.taste.trim()) ? { whatItIs: t.whatItIs.trim(), taste: t.taste.trim() } : null;
  return { id: w.id, producer: w.producer, name: w.name, vintage: w.vintage, region: w.region, country: w.country, grapes: w.grapes, style: w.style, photo, about };
}

/** Loved wines added (or no longer loved) since the shared copy was made, so the app can suggest Update. */
export function changesSince(list: SharedList, wines: Wine[]): number {
  const now = new Set(lovedToShare(wines).map((w) => w.id));
  const then = new Set(list.wines.map((w) => w.id));
  let n = 0;
  for (const id of now) if (!then.has(id)) n++;
  for (const id of then) if (!now.has(id)) n++;
  return n;
}

const FLAGS: Record<string, string> = {
  France: '🇫🇷', Italy: '🇮🇹', Spain: '🇪🇸', Portugal: '🇵🇹', Germany: '🇩🇪', Austria: '🇦🇹', USA: '🇺🇸', 'United States': '🇺🇸',
  Argentina: '🇦🇷', Chile: '🇨🇱', Australia: '🇦🇺', 'New Zealand': '🇳🇿', 'South Africa': '🇿🇦', Greece: '🇬🇷', Hungary: '🇭🇺',
  Lebanon: '🇱🇧', Israel: '🇮🇱', Canada: '🇨🇦', England: '🏴', 'United Kingdom': '🇬🇧', Switzerland: '🇨🇭', Georgia: '🇬🇪', Uruguay: '🇺🇾',
};
export const flagOf = (country: string) => FLAGS[country.trim()] ?? '';

/** The wines grouped by country, the country with the most first; wines without one go last. */
export function byCountry(wines: SharedWine[]): { country: string; wines: SharedWine[] }[] {
  const groups = new Map<string, SharedWine[]>();
  for (const w of wines) {
    const c = w.country.trim() || 'Elsewhere';
    groups.set(c, [...(groups.get(c) ?? []), w]);
  }
  return [...groups.entries()]
    .map(([country, ws]) => ({ country, wines: ws }))
    .sort((a, b) => Number(a.country === 'Elsewhere') - Number(b.country === 'Elsewhere') || b.wines.length - a.wines.length || a.country.localeCompare(b.country));
}

/** The page's address, next to the app: https://…/palate/loved/ */
export function shareUrl(loc: { origin: string; pathname: string } = window.location): string {
  return `${loc.origin}${loc.pathname.replace(/[^/]*$/, '')}${SHARE_SLUG}/`;
}

/** The shared list, as anyone can read it (no sign-in). null when nothing is shared. */
export async function fetchShared(): Promise<SharedList | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/shared_lists?slug=eq.${SHARE_SLUG}&select=data`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`couldn’t load the list (${res.status})`);
  const rows = (await res.json()) as { data: SharedList }[];
  return rows[0]?.data ?? null;
}

// --- Publishing (the owner, signed in) ---

const PHOTO_EDGE = 700;

/** Publishes your Loved wines now, reusing photo copies made last time. */
export async function publishLoved(wines: Wine[]): Promise<{ ok: true; list: SharedList } | { ok: false; reason: string }> {
  const [{ signedInClient }, { db }, { resizeImage }] = await Promise.all([import('./cloud'), import('../db'), import('./image')]);
  const sb = await signedInClient();
  if (!sb) return { ok: false, reason: 'sign in under My palate → Sync across devices first' };
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false, reason: 'sign in under My palate → Sync across devices first' };

  const before = await fetchShared().catch(() => null);
  const photos: Record<string, string> = {};
  const out: SharedWine[] = [];
  for (const w of lovedToShare(wines)) {
    let url: string | null = null;
    if (w.photo?.kind === 'remote') url = w.photo.url;
    else if (w.photo?.kind === 'local') {
      const key = w.photo.blobId;
      url = before?.photos[key] ?? null;
      if (!url) {
        const stored = await db.photos.get(key);
        if (stored) {
          const { blob } = await resizeImage(stored.blob, PHOTO_EDGE);
          const path = `${uid}/${key}.jpg`;
          const up = await sb.storage.from('shared').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
          if (!up.error) url = sb.storage.from('shared').getPublicUrl(path).data.publicUrl;
        }
      }
      if (url) photos[key] = url;
    }
    out.push(sharedWine(w, url));
  }
  // Tags, plain lines and foods: kept from last time, written by Claude for new wines.
  const { blurbsFor, areaOf } = await import('./shareBlurbs');
  const kept = Object.fromEntries((before?.wines ?? []).map((w) => [w.id, w.blurb]));
  const blurbs = await blurbsFor(lovedToShare(wines), kept);
  const byId = new Map(lovedToShare(wines).map((w) => [w.id, w]));
  for (const w of out) {
    w.blurb = blurbs[w.id];
    w.area = areaOf(byId.get(w.id)!);
  }
  const list: SharedList = { name: SHARE_NAME, wines: out, photos, sharedAt: Date.now() };
  const { error } = await sb.from('shared_lists').upsert({ slug: SHARE_SLUG, user_id: uid, data: list, updated_at: new Date().toISOString() });
  if (error) return { ok: false, reason: /relation|does not exist|schema cache/i.test(error.message) ? 'sharing isn’t set up on the server yet' : error.message };
  // Photos of wines no longer on the list are taken down.
  const gone = Object.entries(before?.photos ?? {}).filter(([k]) => !photos[k]).map(([k]) => `${uid}/${k}.jpg`);
  if (gone.length) await sb.storage.from('shared').remove(gone);
  return { ok: true, list };
}

/** Stops sharing: the page shows nothing and its photos are deleted. */
export async function stopSharing(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { signedInClient } = await import('./cloud');
  const sb = await signedInClient();
  if (!sb) return { ok: false, reason: 'sign in under My palate → Sync across devices first' };
  const before = await fetchShared().catch(() => null);
  const { data: auth } = await sb.auth.getUser();
  const { error } = await sb.from('shared_lists').delete().eq('slug', SHARE_SLUG);
  if (error) return { ok: false, reason: error.message };
  const uid = auth.user?.id;
  const files = Object.keys(before?.photos ?? {}).map((k) => `${uid}/${k}.jpg`);
  if (uid && files.length) await sb.storage.from('shared').remove(files);
  return { ok: true };
}
