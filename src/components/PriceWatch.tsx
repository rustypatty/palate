import { useEffect, useRef } from 'react';
import { updateWine } from '../db';
import { useAllWines } from '../hooks';
import { getDeviceKey } from '../lib/labelReader';
import { serverKeyReady } from '../lib/serverKey';
import { PREF_NOTICED, readPref, runPriceCheck, writePref } from '../lib/priceCheck';
import { canWatch, dueForCheck, lastCheckedAt, priceDrops, watchedWines } from '../lib/priceWatch';
import { usePriceAuto, usePriceCheckedAt } from '../lib/usePicks';
import type { Wine } from '../types';
import { useToast } from './Toast';

export function BellIcon({ size = 20, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" />
      <path d="M10 20a2 2 0 0 0 4 0" fill="none" />
    </svg>
  );
}

/** The bell: watch this bottle's price. Only for Loved wines and Want to try bottles. */
export function WatchBell({ wine, small = false }: { wine: Wine; small?: boolean }) {
  const toast = useToast();
  if (!canWatch(wine)) return null;
  const on = Boolean(wine.watch);
  return (
    <button
      type="button"
      className={`icon-btn watch-bell${on ? ' is-saved' : ''}${small ? ' small' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'Watching the price. Stop watching' : 'Watch the price'}
      title={on ? 'Watching the price' : 'Watch the price'}
      onClick={async () => {
        await updateWine(wine.id, { watch: !on });
        toast(on ? 'Stopped watching the price' : 'Watching the price · checked weekly');
      }}
    >
      <BellIcon size={small ? 18 : 20} filled={on} />
    </button>
  );
}

/** Once a week, when the app opens: check the watched bottles' prices (if auto-check is on and the server isn't doing it). */
export function usePriceAutoCheck() {
  const wines = useAllWines();
  const [auto] = usePriceAuto();
  const [local] = usePriceCheckedAt();
  const toast = useToast();
  const started = useRef(false);
  useEffect(() => {
    if (!wines || started.current) return;
    const watched = watchedWines(wines).length;
    if (!dueForCheck({ auto, watched, last: lastCheckedAt(wines, local) })) return;
    // With the key on the server, the server checks every Monday instead.
    if (!getDeviceKey() || serverKeyReady() || !navigator.onLine) return;
    started.current = true;
    // The first automatic check says what's happening, and where to turn it off.
    if (!readPref(PREF_NOTICED, false)) {
      toast(`Checking prices for your ${watched} watched ${watched === 1 ? 'bottle' : 'bottles'}. Turn off in My palate › Settings.`, 8000);
      writePref(PREF_NOTICED, true);
    }
    void runPriceCheck(wines).then(async (r) => {
      if (!r.ok) return;
      const { db } = await import('../db');
      const n = priceDrops(await db.wines.toArray()).length;
      if (n) toast(`${n} ${n === 1 ? 'favourite' : 'favourites'} got cheaper`);
    });
  }, [wines, auto, local, toast]);
}
