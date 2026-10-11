import { useState } from 'react';
import { updateWine } from '../db';
import { currentWindow, forgetAsked } from '../lib/drinkWindow';
import type { Wine } from '../types';
import { useToast } from './Toast';

/** Editing a wine's best years, opened from the Drink window tile in Palate's take. */
export function DrinkWindowEditor({ wine, onDone }: { wine: Wine; onDone: () => void }) {
  const toast = useToast();
  const dw = currentWindow(wine);
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(String(dw?.from ?? year));
  const [to, setTo] = useState(String(dw?.to ?? year + 2));
  const f = Number(from);
  const t = Number(to);
  const valid = Number.isInteger(f) && Number.isInteger(t) && f >= 1900 && t >= f && t <= year + 100;
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

  const save = async () => {
    if (!valid) return;
    await updateWine(wine.id, { drinkWindow: { from: f, to: t, source: 'you', vintage: wine.vintage } });
    onDone();
    toast('Drink window saved');
  };
  const reset = async () => {
    // No window: an estimate is made again (from the take, or by Claude).
    forgetAsked(wine);
    await updateWine(wine.id, { drinkWindow: null });
    onDone();
    toast('Drink window will be estimated again');
  };

  return (
    <div className="window-edit">
      <div className="window-fields">
        <label>
          <span className="small muted">From</span>
          <input className="input white" inputMode="numeric" value={from} onChange={(e) => setFrom(digits(e.target.value))} aria-label="Drink from (year)" />
        </label>
        <label>
          <span className="small muted">To</span>
          <input className="input white" inputMode="numeric" value={to} onChange={(e) => setTo(digits(e.target.value))} aria-label="Drink until (year)" />
        </label>
      </div>
      <div className="window-actions">
        <button type="button" className="btn btn-dark btn-sm" onClick={save} disabled={!valid}>
          Save
        </button>
        <button type="button" className="btn btn-white btn-sm" onClick={onDone}>
          Cancel
        </button>
        {dw?.source === 'you' && (
          <button type="button" className="text-link" onClick={reset}>
            Use the estimate instead
          </button>
        )}
      </div>
    </div>
  );
}
