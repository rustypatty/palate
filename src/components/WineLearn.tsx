import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllWines } from '../hooks';
import { producerAndName } from '../lib/format';
import { hasApiKey } from '../lib/labelReader';
import { cellarLinks, needsLesson, writeLesson } from '../lib/learn';
import type { Wine } from '../types';
import { cleanReason } from './Shelf';

/**
 * "Learn" on a wine page: why it tastes the way it does, and your other bottles that share its
 * place or grapes. Written automatically the first time the wine is opened, then kept.
 */
export function WineLearn({ wine }: { wine: Wine }) {
  const all = useAllWines();
  const links = useMemo(() => (all ? cellarLinks(wine, all) : []), [wine, all]);
  const [state, setState] = useState<{ status: 'idle' | 'busy' } | { status: 'error'; reason: string }>({ status: 'idle' });
  const canWrite = hasApiKey();

  const write = () => {
    if (!all) return;
    setState({ status: 'busy' });
    void writeLesson(wine, all).then((out) => setState(out.ok ? { status: 'idle' } : { status: 'error', reason: out.reason }));
  };

  useEffect(() => {
    if (all && canWrite && navigator.onLine && needsLesson(wine)) write();
  }, [wine.id, Boolean(all)]);

  if (wine.list === 'passed') return null;
  const l = wine.lesson;
  if (!l && !canWrite && !links.length) return null;

  const parts: [string, string][] = l
    ? [
        ['The grape', l.grape],
        ['The place', l.place],
        ['How it’s made', l.making],
      ]
    : [];

  return (
    <section className="coach-card learn-card" aria-live="polite">
      <span className="eyebrow">Learn · why it tastes like this</span>
      {l ? (
        <>
          {parts
            .filter(([, text]) => text.trim())
            .map(([title, text]) => (
              <div key={title} className="coach-part">
                <div className="eyebrow">{title}</div>
                <p>{cleanReason(text)}</p>
              </div>
            ))}
          {l.tasteFor.trim() && (
            <div className="coach-part learn-try">
              <div className="eyebrow">Taste for it</div>
              <p>{cleanReason(l.tasteFor)}</p>
            </div>
          )}
        </>
      ) : !canWrite ? (
        <p className="muted small">Add your Anthropic API key in My palate and Palate will explain the grape, the place and how it’s made.</p>
      ) : state.status === 'error' ? (
        <>
          <p className="small" style={{ color: 'var(--warn)' }}>Couldn’t write this ({state.reason}).</p>
          <button type="button" className="btn btn-white btn-sm" onClick={write} style={{ justifySelf: 'start' }}>
            Try again
          </button>
        </>
      ) : (
        <p className="muted small">Working out the grape, the place and how it’s made…</p>
      )}

      {links.length > 0 && (
        <div className="learn-links">
          <div className="eyebrow">In your cellar</div>
          {links.map((link) => (
            <div key={link.label} className="learn-link">
              <span className="small muted">{link.label}</span>
              <div className="learn-chips">
                {link.wines.map((w) => (
                  <Link key={w.id} to={`/wine/${w.id}`} className="learn-chip">
                    {producerAndName(w)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <p className="small muted" style={{ margin: 0 }}>
            Open one next to this to compare.
          </p>
        </div>
      )}
    </section>
  );
}
