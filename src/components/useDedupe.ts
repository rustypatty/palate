import { useEffect, useRef } from 'react';
import { deleteWine, updateWine } from '../db';
import { useAllWines } from '../hooks';
import { combine, findDuplicates } from '../lib/dedupe';

/**
 * New wines can't be saved twice (createWine completes the saved one instead). Copies made before
 * that, or arriving from another device, are combined quietly a moment after the app opens.
 */
export function useDedupe() {
  const all = useAllWines();
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
      } finally {
        running.current = false;
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [signature]);
}
