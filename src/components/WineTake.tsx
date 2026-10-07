import { useEffect, useState } from 'react';
import { useWines } from '../hooks';
import { updateWine } from '../db';
import { fetchNotes, noteFor, noteKey, notesConfigured, takeFromNote } from '../lib/catalogNotes';
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
  const [state, setState] = useState<{ status: 'idle' | 'busy' | 'checking' } | { status: 'error'; reason: string }>({ status: 'idle' });
  const canWrite = hasApiKey();

  const write = () => {
    if (!wines) return;
    setState({ status: 'busy' });
    void writeTake(wine, wines).then((out) => setState(out.ok ? { status: 'idle' } : { status: 'error', reason: out.reason }));
  };

  // First visit: the catalog's description if it has one (free), else Claude writes one now.
  useEffect(() => {
    if (!wines || !navigator.onLine || !needsTake(wine)) return;
    let live = true;
    void (async () => {
      if (notesConfigured) {
        setState({ status: 'checking' });
        const note = noteFor(wine, await fetchNotes([noteKey(wine.producer, wine.name)]).catch(() => []));
        if (note) await updateWine(wine.id, { take: takeFromNote(note, wine) });
        if (live) setState({ status: 'idle' });
        if (note) return;
      }
      if (live && canWrite) write();
    })();
    return () => {
      live = false;
    };
  }, [wine.id, Boolean(wines)]);

  const t = wine.take;
  if (!t) {
    if (wine.list === 'passed') return null;
    return (
      <section className="coach-card take-card" aria-live="polite">
        <span className="eyebrow">Palate’s take</span>
        {!canWrite && state.status === 'idle' ? (
          <p className="muted small">No description in Palate’s catalog yet. Add your Anthropic API key in My palate and Palate will write one for you.</p>
        ) : state.status === 'error' ? (
          <>
            <p className="small" style={{ color: 'var(--warn)' }}>Couldn’t write a description ({state.reason}).</p>
            <button type="button" className="btn btn-white btn-sm" onClick={write} style={{ justifySelf: 'start' }}>
              Try again
            </button>
          </>
        ) : state.status === 'checking' ? (
          <p className="muted small">Looking for a description…</p>
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
  const fromCatalog = t.source === 'catalog';
  const stale = !fromCatalog && t.rating !== wine.rating;
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
      {fromCatalog ? (
        <div className="take-foot">
          <span className="muted small">From Palate’s wine catalog.</span>
          {canWrite && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={write} disabled={state.status === 'busy'}>
              {state.status === 'busy' ? 'Writing…' : 'Add how it fits you · about 3¢'}
            </button>
          )}
        </div>
      ) : (
        <div className="take-foot">
          <span className="muted small">{stale ? 'Your rating changed since this was written.' : 'Written for you by Claude from what it knows about this wine.'}</span>
          {canWrite && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={write} disabled={state.status === 'busy'}>
              {state.status === 'busy' ? 'Rewriting…' : stale ? 'Update it' : 'Rewrite'}
            </button>
          )}
        </div>
      )}
      {state.status === 'error' && <p className="small" style={{ color: 'var(--warn)' }}>Couldn’t rewrite it ({state.reason}).</p>}
    </section>
  );
}
