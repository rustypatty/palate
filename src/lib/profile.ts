import type { Rating } from '../types';

/**
 * Your wine profile, imported from a history file (schema 2.0, e.g. wine_profile_data.json made
 * from your earlier wine conversations). Palate keeps two things from it:
 *  - the bottles you actually tasted, bought or want, added to your collection (see planImport);
 *  - the profile itself: stated preferences, rules, notes on bottles whose labels weren't
 *    recovered, and what NOT to assume. Every Claude request reads it (profileContext).
 * The file stays on your device; the profile is saved in this browser.
 */

export interface PalateProfile {
  importedAt: number;
  asOf: string;
  owner: string;
  summary: string;
  /** `key` is the file's own name for it ("red_benchmark"); `dimension` is readable. */
  preferences: { key?: string; dimension: string; value: string; confidence: string }[];
  inferences: { hypothesis: string; confidence: string; limits: string }[];
  notSupported: string[];
  pairing: { wine: string; food: string; reaction: string; notes: string }[];
  /** Per-bottle ceiling unless you ask for more in that request. */
  budget: number | null;
  /** Tasting notes on bottles not added as wines: labels not recovered, or no verdict given. */
  feedback: { wine: string; reaction: string; notes: string; candidate: string }[];
  /** Bottles suggested to you before: exposure, not ratings. */
  suggestedBefore: string[];
}

/** One bottle to add to the collection. */
export interface ImportItem {
  sourceId: string;
  /** As written in the file: producer, cuvée and appellation together. */
  name: string;
  vintage: number | null;
  kind: 'rated' | 'owned' | 'want';
  rating: Rating | null;
  notes: string;
  tastedOn: string | null;
}

export interface ImportPlan {
  profile: PalateProfile;
  items: ImportItem[];
}

const KEY = 'palate.profile';

let cache: { raw: string | null; profile: PalateProfile | null } = { raw: null, profile: null };

/** The saved profile; the same object until it changes (safe for useSyncExternalStore). */
export function loadProfile(): PalateProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== cache.raw) cache = { raw, profile: raw ? (JSON.parse(raw) as PalateProfile) : null };
    return cache.profile;
  } catch {
    return null;
  }
}

const CLEARED = 'palate.profileClearedAt';

/**
 * Keep the profile on this device. It's also kept with your account (see cloud.ts), so it survives
 * reinstalling the app; `fromServer` is that copy arriving, which needn't be sent back.
 */
export function saveProfile(p: PalateProfile | null, opts: { fromServer?: boolean } = {}): void {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
    // Removing it here should remove the account's copy too, not have it come back.
    if (!p && !opts.fromServer) localStorage.setItem(CLEARED, String(Date.now()));
    if (p) localStorage.removeItem(CLEARED);
  } catch {
    /* storage unavailable: the profile just isn't kept */
  }
  listeners.forEach((l) => l());
}

/** When the profile was removed on this device (to remove the account's copy), if it was. */
export function profileClearedAt(): number | null {
  try {
    const v = Number(localStorage.getItem(CLEARED));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function forgetProfileClear(): void {
  try {
    localStorage.removeItem(CLEARED);
  } catch {
    /* nothing to forget */
  }
}

const listeners = new Set<() => void>();
export function subscribeProfile(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v));

/** "Château Haut-Bages Libéral Pauillac 2023" */
const titled = (w: Json) => [str(w.wine), w.vintage ? String(w.vintage) : ''].filter(Boolean).join(' ');

const RATED: Record<string, Rating> = {
  loved: 'loved',
  really_liked: 'liked',
  liked: 'liked',
  would_not_repurchase: 'wouldnt',
  disliked: 'wouldnt',
};

/** Reads a history file. Throws a readable message when it isn't one. */
export function planImport(text: string, now = Date.now()): ImportPlan {
  let data: Json;
  try {
    data = JSON.parse(text) as Json;
  } catch {
    throw new Error('That file isn’t valid JSON.');
  }
  const p = data.profile as Json | undefined;
  const wines = data.wines as Json[] | undefined;
  if (!p || !Array.isArray(wines)) throw new Error('That file doesn’t look like a wine profile (no "profile" and "wines").');

  const prefs = (p.explicit_preferences as Json[] | undefined) ?? [];
  const budgetPref = prefs.find((x) => x.dimension === 'budget' && typeof x.value === 'number');
  const profile: PalateProfile = {
    importedAt: now,
    asOf: str(p.as_of || data.created_at),
    owner: str(p.owner || data.owner),
    summary: str(p.summary),
    preferences: prefs.map((x) => ({
      key: str(x.dimension),
      dimension: str(x.dimension).replace(/_/g, ' '),
      value: x.dimension === 'budget' ? `$${str(x.value)} a bottle. ${str(x.rule)}`.trim() : str(x.value) + (x.notes ? ` (${str(x.notes)})` : ''),
      confidence: str(x.confidence),
    })),
    inferences: ((p.inferences as Json[] | undefined) ?? []).map((x) => ({ hypothesis: str(x.hypothesis), confidence: str(x.confidence), limits: str(x.limits) })),
    notSupported: ((p.not_supported as unknown[] | undefined) ?? []).map(str),
    pairing: ((p.pairing_feedback as Json[] | undefined) ?? []).map((x) => ({ wine: str(x.wine_style), food: str(x.food), reaction: str(x.reaction), notes: str(x.notes) })),
    budget: budgetPref ? Number(budgetPref.value) : null,
    feedback: [],
    suggestedBefore: [],
  };

  const items: ImportItem[] = [];
  for (const w of wines) {
    const status = str(w.status);
    const confirmed = w.identity_status === 'confirmed' || w.identity_status === 'retrieved_identity';
    const notes = str(w.user_notes);
    const vintage = typeof w.vintage === 'number' ? w.vintage : null;
    const tasting = ((w.events as Json[] | undefined) ?? []).find((e) => e.type === 'tasting_feedback' && typeof e.date === 'string');
    const base = { sourceId: str(w.id), name: str(w.wine), vintage, tastedOn: tasting ? str(tasting.date) : null };
    const candidate = w.candidate_identity ? titled(w.candidate_identity as Json) : '';

    if (status in RATED && confirmed && w.identity_status === 'confirmed') {
      const extra = status === 'really_liked' ? 'Really liked it.' : '';
      items.push({ ...base, kind: 'rated', rating: RATED[status], notes: [extra, notes].filter(Boolean).join(' ') });
    } else if (status in RATED && w.identity_status === 'retrieved_identity') {
      // A remembered verdict on a named bottle (e.g. a dislike from months ago): add it, noted as recalled.
      items.push({ ...base, kind: 'rated', rating: RATED[status], notes: [notes, '(Recalled from an earlier conversation.)'].filter(Boolean).join(' ') });
    } else if (status in RATED || status === 'tasted_unrated' || status === 'reported_liked') {
      // Label not recovered, or no verdict of mine: kept as profile notes, not as a bottle.
      profile.feedback.push({ wine: titled(w), reaction: status.replace(/_/g, ' '), notes, candidate });
    } else if ((status === 'purchased_untasted' || status === 'purchased_unrated') && w.identity_status === 'confirmed') {
      items.push({ ...base, kind: 'owned', rating: null, notes });
    } else if (status === 'interested') {
      items.push({ ...base, kind: 'want', rating: null, notes });
    } else if (status === 'recommended' || status === 'discussed') {
      profile.suggestedBefore.push(titled(w));
    }
    // purchase_reported and anything else uncertain: left out.
  }
  return { profile, items };
}

/** The profile as Claude reads it, ahead of your rated wines. */
const PREF_LABEL: Record<string, string> = {
  red_benchmark: 'Favourite red',
  red_favorites: 'Favourite reds',
  white_style_favorites: 'Favourite whites',
  white_style: 'Whites',
  tannin: 'Tannin',
  fruit: 'Fruit',
  education: 'How you like advice',
  budget: 'Budget',
};
/** Bookkeeping about the file itself, not about your taste. */
const NOT_SHOWN = new Set(['wine_identity']);

/** Your preferences in plain words, for My palate. */
export function shownPreferences(p: PalateProfile): { label: string; value: string }[] {
  return p.preferences
    .map((x) => ({ key: x.key ?? x.dimension.replace(/ /g, '_'), x }))
    .filter(({ key }) => !NOT_SHOWN.has(key))
    .map(({ key, x }) => ({ label: PREF_LABEL[key] ?? x.dimension[0].toUpperCase() + x.dimension.slice(1), value: x.value.replace(/\s*\([^()]*\)$/, '') }));
}

/** Wines and styles you named as favourites ("Barolo", "Sancerre"…), favourite reds first. */
export function profileFavourites(p: PalateProfile | null): string[] {
  if (!p) return [];
  const order = ['red_benchmark', 'red_favorites', 'white_style_favorites'];
  return [
    ...new Set(
      order.flatMap((k) =>
        p.preferences
          .filter((x) => (x.key ?? x.dimension.replace(/ /g, '_')) === k)
          .flatMap((x) => x.value.replace(/\s*\(.*\)$/, '').split(/,\s*/))
          .filter(Boolean),
      ),
    ),
  ];
}

/** The red you named as your favourite / benchmark, if the profile has one. */
export function favouriteRed(p: PalateProfile | null): string {
  const x = p?.preferences.find((x) => (x.key ?? x.dimension.replace(/ /g, '_')) === 'red_benchmark');
  return x ? x.value.replace(/\s*\([^()]*\)$/, '') : '';
}

export function profileContext(p: PalateProfile | null): string {
  if (!p) return '';
  const lines: string[] = [];
  if (p.summary) lines.push(`My wine profile (as of ${p.asOf}): ${p.summary}`);
  if (p.preferences.length) lines.push(`What I've said I like and how I want advice:\n${p.preferences.map((x) => `- ${x.dimension}: ${x.value}`).join('\n')}`);
  if (p.inferences.length) lines.push(`Working hypotheses (not certainties):\n${p.inferences.map((x) => `- ${x.hypothesis} (${x.confidence}; ${x.limits})`).join('\n')}`);
  if (p.feedback.length) {
    lines.push(
      `Notes on bottles whose labels weren't recovered or that I didn't rate:\n${p.feedback
        .map((x) => `- ${x.wine} (${x.reaction})${x.notes ? `: "${x.notes}"` : ''}${x.candidate ? ` [possibly ${x.candidate}, unconfirmed]` : ''}`)
        .join('\n')}`,
    );
  }
  if (p.pairing.length) lines.push(`Pairing notes:\n${p.pairing.map((x) => `- ${x.wine} with ${x.food}: ${x.reaction}${x.notes ? ` (${x.notes})` : ''}`).join('\n')}`);
  if (p.notSupported.length) lines.push(`Don't assume any of these about me:\n${p.notSupported.map((x) => `- ${x}`).join('\n')}`);
  if (p.budget) lines.push(`Budget in shops: stay at or under $${p.budget} a bottle unless I ask for more in this request (at a restaurant, use the budget I pick there).`);
  return lines.join('\n\n');
}

/** Your saved profile, when there is one, ahead of other context about you. */
export function withProfile(rest: string): string {
  const p = profileContext(loadProfile());
  return p ? `${p}\n\n${rest}` : rest;
}
