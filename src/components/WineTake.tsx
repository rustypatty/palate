import { useEffect, useState } from 'react';
import { useWines } from '../hooks';
import { hasApiKey } from '../lib/labelReader';
import { needsTake, writeTake } from '../lib/wineTake';
import type { Wine } from '../types';
import { cleanReason } from './Shelf';

/**
 * "Palate's take" on a wine page: what the wine is, how it tastes, how it fits you and how to
 * serve it. Written automatically the first time a wine is opened (about 3¢), then kept.
 */
export function WineTake({ wine }: { wine: Wine }) {
  const wines = useWines();
  const [state, setState] = useState<{ status: 'idle' | 'busy' } | { status: 'error'; reason: string }>({ status: 'idle' });
  const canWrite = hasApiKey();

  const write = () => {
    if (!wines) return;
    setState({ status: 'busy' });
    void writeTake(wine, wines).then((out) => setState(out.ok ? { status: 'idle' } : { status: 'error', reason: out.reason }));
  };

  // First visit: write it now, so the page explains the wine without a tap.
  useEffect(() => {
    if (wines && canWrite && navigator.onLine && needsTake(wine)) write();
  }, [wine.id, Boolean(wines)]);

  const t = wine.take;
  if (!t) {
    if (wine.list === 'passed') return null;
    return (
      <section className="coach-card take-card" aria-live="polite">
        <span className="eyebrow">Palate’s take</span>
        {!canWrite ? (
          <p className="muted small">Add your Anthropic API key in My palate and Palate will describe this wine for you.</p>
        ) : state.status === 'error' ? (
          <>
            <p className="small" style={{ color: 'var(--warn)' }}>Couldn’t write a description ({state.reason}).</p>
            <button type="button" className="btn btn-white btn-sm" onClick={write} style={{ justifySelf: 'start' }}>
              Try again
            </button>
          </>
        ) : (
          <p className="muted small">Writing a description of this wine for you…</p>
        )}
      </section>
    );
  }

  const parts: [string, string][] = [
    ['What it is', t.whatItIs],
    ['How it tastes', t.taste],
    ['For you', t.fit],
    ['Serve it', t.serve],
  ];
  const stale = t.rating !== wine.rating;
  return (
    <section className="coach-card take-card" aria-live="polite">
      <span className="eyebrow">Palate’s take</span>
      {parts
        .filter(([, text]) => text.trim())
        .map(([title, text]) => (
          <div key={title} className="coach-part">
            <div className="eyebrow">{title}</div>
            <p>{cleanReason(text)}</p>
          </div>
        ))}
      {t.caveat.trim() && <p className="coach-caveat">{cleanReason(t.caveat)}</p>}
      <div className="take-foot">
        <span className="muted small">{stale ? 'Your rating changed since this was written.' : 'Written for you by Claude from what it knows about this wine.'}</span>
        {canWrite && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={write} disabled={state.status === 'busy'}>
            {state.status === 'busy' ? 'Rewriting…' : stale ? 'Update it' : 'Rewrite'}
          </button>
        )}
      </div>
      {state.status === 'error' && <p className="small" style={{ color: 'var(--warn)' }}>Couldn’t rewrite it ({state.reason}).</p>}
    </section>
  );
}
