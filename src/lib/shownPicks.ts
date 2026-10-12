/**
 * The bottles recent store lists already showed, per store, so "make a list" doesn't hand back the
 * same bottles every time. Kept on this device for two weeks.
 */

const KEY = 'palate.shownPicks';
const KEEP = 14 * 24 * 3600 * 1000;

export interface ShownPick {
  key: string;
  title: string;
  at: number;
}

type Shown = Record<string, ShownPick[]>;

function load(): Shown {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return raw && typeof raw === 'object' ? (raw as Shown) : {};
  } catch {
    return {};
  }
}

/** What a store's recent lists showed (newest first, at most 40). */
export function recentlyShown(storeId: string, now = Date.now()): ShownPick[] {
  return (load()[storeId] ?? []).filter((p) => now - p.at < KEEP).slice(0, 40);
}

/** Remember the bottles a new list showed. */
export function rememberShown(storeId: string, picks: { key: string; title: string }[], now = Date.now()): void {
  try {
    const all = load();
    const fresh = new Set(picks.map((p) => p.key));
    all[storeId] = [...picks.map((p) => ({ key: p.key, title: p.title, at: now })), ...recentlyShown(storeId, now).filter((p) => !fresh.has(p.key))].slice(0, 40);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode: nothing remembered */
  }
}

/** A copy in random order (Fisher–Yates), so Claude doesn't favour whatever is at the top of the list. */
export function shuffled<T>(xs: T[], random: () => number = Math.random): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
