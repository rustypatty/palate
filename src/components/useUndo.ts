import { useCallback, useEffect, useRef, useState } from 'react';

const UNDO_MS = 6000;

/**
 * "Not for me" and "Remove" with Undo: the item shows as a dashed row for a few seconds
 * and the change is only saved after that (or when you leave the page), so Undo is free.
 */
export function useUndo() {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const jobs = useRef(new Map<string, { timer: number; commit: () => unknown }>());

  useEffect(() => {
    const all = jobs.current;
    return () => {
      // Leaving the page: save whatever wasn't undone.
      for (const job of all.values()) {
        window.clearTimeout(job.timer);
        void job.commit();
      }
      all.clear();
    };
  }, []);

  const start = useCallback((key: string, commit: () => unknown) => {
    if (jobs.current.has(key)) return;
    const timer = window.setTimeout(() => {
      jobs.current.delete(key);
      void commit();
    }, UNDO_MS);
    jobs.current.set(key, { timer, commit });
    setPending((p) => new Set(p).add(key));
  }, []);

  const undo = useCallback((key: string) => {
    const job = jobs.current.get(key);
    if (job) window.clearTimeout(job.timer);
    jobs.current.delete(key);
    setPending((p) => {
      const next = new Set(p);
      next.delete(key);
      return next;
    });
  }, []);

  return { isPending: (key: string) => pending.has(key), start, undo };
}
