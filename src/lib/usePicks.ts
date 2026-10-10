import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import { useLists, useWines } from '../hooks';
import { makeAdvisor } from './insights';
import { explainSuggestions, rankCandidates, type Pick } from './recommend';
import { clearStoreList, listExpired, storeById, type StoreId, type StoreItem, type SuggestedItem } from './stores';
import { buildTaste } from './taste';
import { loadTwStock, type TwStock } from './twStock';

// Per-device conveniences: which store and budget you last picked.
export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const read = useCallback((): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }, [key, fallback]);
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const on = () => setValue(read());
    window.addEventListener(`palate:${key}`, on);
    return () => window.removeEventListener(`palate:${key}`, on);
  }, [key, read]);
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* private mode: just this session */
      }
      setValue(v);
      window.dispatchEvent(new Event(`palate:${key}`));
    },
    [key],
  );
  return [value, set];
}

export const useStoreChoice = () => usePref<StoreId>('palate.store', 'totalwine');
export const useBudget = () => usePref<number | null>('palate.budget', null);
/** In store: shopping, or choosing from a restaurant's list. */
export const useStoreMode = () => usePref<'shop' | 'restaurant'>('palate.storeMode', 'shop');
/** A bottle budget at a restaurant, kept apart from the shop budget. */
export const useRestaurantBudget = () => usePref<number | null>('palate.restaurantBudget', null);

export function useTaste() {
  const wines = useWines();
  return useMemo(() => (wines ? buildTaste(wines) : undefined), [wines]);
}

export function useAdvisor() {
  const wines = useWines();
  return useMemo(() => (wines ? makeAdvisor(wines) : undefined), [wines]);
}

export interface StorePicks {
  /** undefined while loading; null when nothing has been loaded for this store yet. */
  fetchedAt: number | null | undefined;
  picks: Pick<StoreItem | SuggestedItem>[];
  tips: string[];
  /** Listing keys already on the Want to try list. */
  saved: Set<string>;
  /** Everything loaded for this store (for "More like this"). */
  items: (StoreItem | SuggestedItem)[];
  /** The list was picked from imported stock. */
  fromStock?: { storeName: string; importedAt: number; count: number };
}

export function useStorePicks(id: StoreId, budget: number | null, n = 12): StorePicks {
  // Read only here: a live query can't write, so an expired list is hidden now and deleted just after.
  const result = useLiveQuery(async () => {
    const cache = (await db.stores.get(id)) ?? null;
    return { id, cache: cache && listExpired(cache) ? null : cache, expired: Boolean(cache && listExpired(cache)) };
  }, [id]);
  useEffect(() => {
    if (result?.expired) void clearStoreList(result.id);
  }, [result?.expired, result?.id]);
  // Right after switching stores the previous store's result is still here: treat it as loading.
  const cache = result?.id === id ? result.cache : undefined;
  const advisor = useAdvisor();
  const taste = useTaste();
  const lists = useLists();
  return useMemo(() => {
    const saved = new Set((lists?.want ?? []).map((w) => w.suggestion?.key).filter((k): k is string => Boolean(k)));
    if (cache === undefined || !advisor || !lists) return { fetchedAt: undefined, picks: [], tips: [], saved, items: [] };
    if (cache === null) return { fetchedAt: null, picks: [], tips: [], saved, items: [] };
    const opts = { passed: lists.passed, budget, usual: taste?.price ?? null };
    const store = storeById(id);
    if (store.kind === 'catalog') {
      const items = cache.items ?? [];
      return { fetchedAt: cache.fetchedAt, picks: rankCandidates(advisor, items, opts, n), tips: [], saved, items };
    }
    const items = cache.list?.picks ?? [];
    return { fetchedAt: cache.fetchedAt, picks: explainSuggestions(advisor, items, opts).slice(0, n), tips: cache.list?.tips ?? [], saved, items, fromStock: cache.list?.fromStock };
  }, [cache, advisor, lists, taste, budget, id, n]);
}

/** Every store bottle saved on this device (Pogo's list and any Claude lists), with its store. */
export function useAllStoreItems(): { storeId: StoreId; item: StoreItem | SuggestedItem }[] | undefined {
  const caches = useLiveQuery(() => db.stores.toArray(), []);
  return useMemo(
    () => caches?.filter((c) => !listExpired(c)).flatMap((c) => [...(c.items ?? []), ...(c.list?.picks ?? [])].map((item) => ({ storeId: c.id, item }))),
    [caches],
  );
}

// One load of the imported Total Wine stock for a few minutes, shared by every screen.
let stockLoad: { at: number; p: Promise<TwStock | null> } | null = null;

/** The imported Total Wine stock (Chrome extension): undefined while loading, null if none. */
export function useTwStock(enabled = true): TwStock | null | undefined {
  const [stock, setStock] = useState<TwStock | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('palate:twstock', on);
    return () => window.removeEventListener('palate:twstock', on);
  }, []);
  useEffect(() => {
    if (!enabled) return setStock(null);
    if (!stockLoad || Date.now() - stockLoad.at > 5 * 60 * 1000) stockLoad = { at: Date.now(), p: loadTwStock().catch(() => null) };
    let live = true;
    void stockLoad.p.then((s) => live && setStock(s));
    return () => {
      live = false;
    };
  }, [enabled, tick]);
  return stock;
}

/** Load the imported stock again (after a refresh finished). */
export function reloadTwStock() {
  stockLoad = null;
  window.dispatchEvent(new Event('palate:twstock'));
}

/** Tonight's last dish choice. */
export const useTonightDish = () => usePref<import('./tonight').Dish>('palate.tonightDish', 'pasta');

/** Price watch: check weekly when the app opens (on unless turned off in Settings). */
export const usePriceAuto = () => usePref<boolean>('palate.priceAuto', true);
/** When prices were last checked on this device. */
export const usePriceCheckedAt = () => usePref<number | null>('palate.priceCheckedAt', null);
