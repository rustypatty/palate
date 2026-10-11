import { useState } from 'react';
import { updateWine } from '../db';
import { currentWindow, forgetAsked, formatWindow, needsWindow, STATUS_LABEL, windowStatus } from '../lib/drinkWindow';
import type { Wine } from '../types';
import { useToast } from './Toast';

const SOURCE_NOTE = { take: 'From Palate’s take', claude: 'Estimated by Claude', you: 'Set by you' } as const;

/** "Best years 2026–32 · Ready" under In my cellar, editable. For bottles you own, or any wine with a window you set. */
export function DrinkWindowCard({ wine }: { wine: Wine }) {
  const toast = useToast();
  const dw = currentWindow(wine);
  const [edit, setEdit] = useState<{ from: string; to: string } | null>(null);
  if (wine.list || (wine.owned === 0 && !dw)) return null;

  const status = dw ? windowStatus(dw) : null;
  const year = new Date().getFullYear();
  const from = Number(edit?.from);
  const to = Number(edit?.to);
  const valid = Number.isInteger(from) && Number.isInteger(to) && from >= 1900 && to >= from && to <= year + 100;

  const save = async () => {
    if (!valid) return;
    await updateWine(wine.id, { drinkWindow: { from, to, source: 'you', vintage: wine.vintage } });
    setEdit(null);
    toast('Best years saved');
  };
  const reset = async () => {
    // No window: an estimate is made again (from the take, or by Claude).
    forgetAsked(wine);
    await updateWine(wine.id, { drinkWindow: null });
    setEdit(null);
    toast('Best years will be estimated again');
  };

  if (edit) {
    return (
      <div className="tone-card window-card window-edit">
        <div className="cellar-title">Best years</div>
        <div className="window-fields">
          <label>
            <span className="small muted">From</span>
            <input className="input white" inputMode="numeric" value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value.replace(/\D/g, '').slice(0, 4) })} aria-label="Best from (year)" />
          </label>
          <label>
            <span className="small muted">To</span>
            <input className="input white" inputMode="numeric" value={edit.to} onChange={(e) => setEdit({ ...edit, to: e.target.value.replace(/\D/g, '').slice(0, 4) })} aria-label="Best until (year)" />
          </label>
        </div>
        <div className="window-actions">
          <button type="button" className="btn btn-dark btn-sm" onClick={save} disabled={!valid}>
            Save
          </button>
          <button type="button" className="btn btn-white btn-sm" onClick={() => setEdit(null)}>
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

  return (
    <div className="tone-card window-card">
      <div>
        <div className="cellar-title">Best years</div>
        <div className="small muted">
          {dw ? (
            <>
              {formatWindow(dw)} · {SOURCE_NOTE[dw.source]}
            </>
          ) : needsWindow(wine) ? (
            'Not worked out yet'
          ) : (
            'Not set'
          )}
        </div>
      </div>
      <div className="cellar-controls">
        {status && <span className={`window-status ${status}`}>{STATUS_LABEL[status]}</span>}
        <button
          type="button"
          className="text-link"
          onClick={() => setEdit({ from: String(dw?.from ?? year), to: String(dw?.to ?? year + 2) })}
        >
          {dw ? 'Edit' : 'Set'}
        </button>
      </div>
    </div>
  );
}
