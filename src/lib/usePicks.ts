import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import { useLists, useWines } from '../hooks';
import { makeAdvisor } from './insights';
import { explainSuggestions, type Pick } from './recommend';
import { clearStoreList, listExpired, listMadeAt, type StoreId, type StoreItem, type SuggestedItem } from './stores';
import { buildTaste } from './taste';
import { loadTwStock, loadTwStores, type TwStock, type TwStoreInfo } from './twStock';

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
  /** When Claude made this store's list: undefined while loading; null when there's no list. */
  fetchedAt: number | null | undefined;
  /** When the store's own wine list was downloaded (Pogo's); null when it hasn't been. */
  stockAt: number | null | undefined;
  /** That downloaded wine list. */
  stockItems: StoreItem[];
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
  // Read only here: a live query can't write, so an expired list is hidden now and cleared just after.
  const result = useLiveQuery(async () => {
    const row = (await db.stores.get(id)) ?? null;
    const expired = Boolean(row && listExpired(row));
    return { id, cache: row && expired ? { ...row, list: undefined } : row, expired };
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
    const empty = { picks: [], tips: [], saved, items: [], stockItems: [] };
    if (cache === undefined || !advisor || !lists) return { ...empty, fetchedAt: undefined, stockAt: undefined };
    if (cache === null) return { ...empty, fetchedAt: null, stockAt: null };
    const opts = { passed: lists.passed, budget, usual: taste?.price ?? null };
    const list = cache.list;
    const stockItems = cache.items ?? [];
    return {
      fetchedAt: listMadeAt(cache),
      stockAt: cache.items ? cache.fetchedAt : null,
      stockItems,
      picks: list ? explainSuggestions(advisor, list.picks, opts).slice(0, n) : [],
      tips: list?.tips ?? [],
      saved,
      items: [...stockItems, ...(list?.picks ?? [])],
      fromStock: list?.fromStock,
    };
  }, [cache, advisor, lists, taste, budget, n]);
}

/** Every store bottle saved on this device (Pogo's list and any Claude lists), with its store. */
export function useAllStoreItems(): { storeId: StoreId; item: StoreItem | SuggestedItem }[] | undefined {
  const caches = useLiveQuery(() => db.stores.toArray(), []);
  return useMemo(
    () => caches?.flatMap((c) => [...(c.items ?? []), ...(listExpired(c) ? [] : (c.list?.picks ?? []))].map((item) => ({ storeId: c.id, item }))),
    [caches],
  );
}

// Each store's imported Total Wine stock, loaded once for a few minutes and shared by every screen.
const stockLoads = new Map<string, { at: number; p: Promise<TwStock | null> }>();

/** One store's imported stock (the newest import's store when none is named), cached a few minutes. */
export function twStockFor(storeId: string | null): Promise<TwStock | null> {
  const k = storeId ?? '';
  const hit = stockLoads.get(k);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.p;
  const p = loadTwStock(storeId).catch(() => null);
  stockLoads.set(k, { at: Date.now(), p });
  return p;
}

/** Which Total Wine store lists use: 'nearest' (decided when you make a list) or a store number. */
export const useTwStoreChoice = () => usePref<string>('palate.twStore', 'nearest');
/** The store found nearest you last time, used until the next list. */
export const useTwNearest = () => usePref<string | null>('palate.twNearest', null);
/** Make a list: reds, whites, or either. */
export const useListStyle = () => usePref<'any' | 'red' | 'white'>('palate.listStyle', 'any');

/** Total Wine stores with recent stock. */
export function useTwStores(enabled = true): TwStoreInfo[] | undefined {
  const [stores, setStores] = useState<TwStoreInfo[] | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('palate:twstock', on);
    return () => window.removeEventListener('palate:twstock', on);
  }, []);
  useEffect(() => {
    if (!enabled) return setStores([]);
    let live = true;
    void loadTwStores().then((s) => live && setStores(s));
    return () => {
      live = false;
    };
  }, [enabled, tick]);
  return stores;
}

/** The imported Total Wine stock (Chrome extension): undefined while loading, null if none. */
export function useTwStock(enabled = true, storeId: string | null = null): TwStock | null | undefined {
  const [stock, setStock] = useState<TwStock | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('palate:twstock', on);
    return () => window.removeEventListener('palate:twstock', on);
  }, []);
  useEffect(() => {
    if (!enabled) return setStock(null);
    let live = true;
    void twStockFor(storeId).then((s) => live && setStock(s));
    return () => {
      live = false;
    };
  }, [enabled, tick, storeId]);
  return stock;
}

/** Load the imported stock again (after a refresh finished). */
export function reloadTwStock() {
  stockLoads.clear();
  window.dispatchEvent(new Event('palate:twstock'));
}

/** Tonight's last dish choice. */
export const useTonightDish = () => usePref<import('./tonight').Dish>('palate.tonightDish', 'pasta');

/** Price watch: check weekly when the app opens (on unless turned off in Settings). */
export const usePriceAuto = () => usePref<boolean>('palate.priceAuto', true);
/** When prices were last checked on this device. */
export const usePriceCheckedAt = () => usePref<number | null>('palate.priceCheckedAt', null);
