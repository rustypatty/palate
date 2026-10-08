import { useEffect, useRef } from 'react';
import { deleteWine, updateWine } from '../db';
import { useAllWines } from '../hooks';
import { combine, findDuplicates } from '../lib/dedupe';
import { useToast } from './Toast';

/**
 * The same bottle saved twice is combined automatically, a moment after the app opens (so a sync
 * or an import has finished): one record keeps everything from both, the other is removed.
 */
export function useDedupe() {
  const all = useAllWines();
  const toast = useToast();
  const running = useRef(false);
  const pairs = all ? findDuplicates(all) : [];
  const signature = pairs.map(([a, b]) => `${a.id}+${b.id}`).join(',');
  useEffect(() => {
    if (!pairs.length || running.current) return;
    const timer = window.setTimeout(async () => {
      running.current = true;
      try {
        for (const [keep, drop] of pairs) {
          await updateWine(keep.id, combine(keep, drop));
          await deleteWine(drop.id);
        }
        toast(`Combined ${pairs.length} ${pairs.length === 1 ? 'bottle' : 'bottles'} saved twice`);
      } finally {
        running.current = false;
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [signature]);
}
