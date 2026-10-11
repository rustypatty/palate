import { useEffect } from 'react';
import { useAllWines } from '../hooks';
import { fillWindows, needsWindow } from '../lib/drinkWindow';

/**
 * Bottles you own get a drinking window a moment after the app opens or a bottle is added:
 * from Palate's take when it names one (free), else one Claude request for all of them.
 */
export function useDrinkWindows() {
  const all = useAllWines();
  const signature = (all ?? []).filter(needsWindow).map((w) => `${w.id}:${w.vintage ?? ''}`).join(',');
  useEffect(() => {
    if (!signature || !all) return;
    const timer = window.setTimeout(() => void fillWindows(all), 3000);
    return () => window.clearTimeout(timer);
  }, [signature]);
}
