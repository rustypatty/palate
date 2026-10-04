import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import { useLists, useWines } from '../hooks';
import { makeAdvisor } from './insights';
import { explainSuggestions, rankCandidates, type Pick } from './recommend';
import { storeById, type StoreId, type StoreItem, type SuggestedItem } from './stores';
import { buildTaste } from './taste';

// Per-device conveniences: which store and budget you last picked.
function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
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
}

export function useStorePicks(id: StoreId, budget: number | null, n = 12): StorePicks {
  const result = useLiveQuery(async () => ({ id, cache: (await db.stores.get(id)) ?? null }), [id]);
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
    return { fetchedAt: cache.fetchedAt, picks: explainSuggestions(advisor, items, opts).slice(0, n), tips: cache.list?.tips ?? [], saved, items };
  }, [cache, advisor, lists, taste, budget, id, n]);
}
