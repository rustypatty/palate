import { useEffect, useState, type ReactNode } from 'react';
import { useWines } from '../hooks';
import { updateWine } from '../db';
import { fetchNotes, fetchNotesByIds, noteFor, noteForIds, noteKey, notesConfigured, takeFromNote } from '../lib/catalogNotes';
import { hasApiKey } from '../lib/labelReader';
import { needsTake, writeTake } from '../lib/wineTake';
import type { Wine } from '../types';
import { cleanReason } from './Shelf';
import { serveFacts, tasteTags } from './takeFormat';

/** A Bodoni heading whose last word is italic: "What it *is*". */
function Head({ text }: { text: string }) {
  const i = text.lastIndexOf(' ');
  return (
    <h3 className="take-head">
      {text.slice(0, i + 1)}
      <em>{text.slice(i + 1)}</em>
    </h3>
  );
}

/**
 * "Palate's take" on a wine page: what the wine is, how it tastes, how it fits you and how to
 * serve it. Written automatically the first time a wine is opened (about 3¢), then kept.
 * `children` (the Learn tile) sits after "Serve it".
 */
export function WineTake({ wine, children }: { wine: Wine; children?: ReactNode }) {
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
        let note = noteFor(wine, await fetchNotes([noteKey(wine.producer, wine.name)]).catch(() => []));
        if (!note) {
          // Written differently from the catalog's name: identify it, then look up by id.
          const ids = await import('../lib/catalog').then((m) => m.catalogWineIds(wine.producer, wine.name)).catch(() => [] as string[]);
          if (ids.length) note = noteForIds(ids, await fetchNotesByIds(ids).catch(() => []));
        }
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
      <section className="take-section" aria-live="polite">
        <span className="take-eyebrow">Palate’s take</span>
        {!canWrite && state.status === 'idle' ? (
          <p className="take-text muted">No description in Palate’s catalog yet. Add your Anthropic API key in My palate and Palate will write one for you.</p>
        ) : state.status === 'error' ? (
          <>
            <p className="take-text" style={{ color: 'var(--warn)' }}>Couldn’t write a description ({state.reason}).</p>
            <button type="button" className="btn btn-white btn-sm" onClick={write} style={{ justifySelf: 'start' }}>
              Try again
            </button>
          </>
        ) : state.status === 'checking' ? (
          <p className="take-text muted">Looking for a description…</p>
        ) : (
          <p className="take-text muted">Writing a description of this wine for you…</p>
        )}
        {children}
      </section>
    );
  }

  const fromCatalog = t.source === 'catalog';
  const stale = !fromCatalog && t.rating !== wine.rating;
  const taste = tasteTags(cleanReason(t.taste));
  const serve = t.serve.trim() ? serveFacts(cleanReason(t.serve)) : null;
  return (
    <section className="take-section" aria-live="polite">
      <span className="take-eyebrow">Palate’s take</span>
      {t.whatItIs.trim() && (
        <div className="take-part">
          <Head text="What it is" />
          <p className="take-text">{cleanReason(t.whatItIs)}</p>
        </div>
      )}
      {t.taste.trim() && (
        <div className="take-part">
          <Head text="How it tastes" />
          {taste.tags.length > 0 && (
            <div className="taste-tags">
              {taste.tags.map((tag) => (
                <span key={tag} className="taste-tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {taste.rest && <p className="take-text">{taste.rest}</p>}
        </div>
      )}
      {t.fit.trim() && (
        <div className="take-part">
          <Head text="For you" />
          <p className="take-text">{cleanReason(t.fit)}</p>
        </div>
      )}
      {t.serve.trim() && (
        <div className="take-part">
          <Head text="Serve it" />
          {serve ? (
            <>
              <div className="serve-tiles">
                {serve.tiles.map((tile) => (
                  <div key={tile.label} className="serve-tile">
                    <div className="serve-value">{tile.value}</div>
                    <div className="serve-label">{tile.label}</div>
                  </div>
                ))}
              </div>
              {serve.pairing && <p className="serve-pairing">{serve.pairing}</p>}
            </>
          ) : (
            <p className="take-text">{cleanReason(t.serve)}</p>
          )}
        </div>
      )}
      {t.caveat.trim() && <p className="coach-caveat">{cleanReason(t.caveat)}</p>}
      {children}
      <div className="take-footer">
        <span>{fromCatalog ? 'From Palate’s wine catalog' : stale ? 'Your rating changed since this was written' : 'Written for you by Claude'}</span>
        {canWrite && (
          <button type="button" className="take-action" onClick={write} disabled={state.status === 'busy'}>
            {fromCatalog
              ? state.status === 'busy'
                ? 'Writing…'
                : 'Add how it fits you'
              : state.status === 'busy'
                ? 'Rewriting…'
                : stale
                  ? 'Update it'
                  : 'Rewrite'}
          </button>
        )}
      </div>
      {state.status === 'error' && <p className="small" style={{ color: 'var(--warn)', margin: 0 }}>Couldn’t rewrite it ({state.reason}).</p>}
    </section>
  );
}
