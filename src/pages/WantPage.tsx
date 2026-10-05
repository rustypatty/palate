import { ArrowUpRight, Bookmark, Check, ChevronLeft, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BottleImage } from '../components/BottleImage';
import { cleanReason, HiddenRow } from '../components/Shelf';
import { useToast } from '../components/Toast';
import { useUndo } from '../components/useUndo';
import { deleteWine, updateWine } from '../db';
import { useLists } from '../hooks';
import { formatPrice, vintageLabel } from '../lib/format';
import type { Wine } from '../types';

/** Where a saved bottle was suggested: "Total Wine", else where you said you'd buy it. */
const storeOf = (w: Wine) => w.suggestion?.source || w.store || 'Elsewhere';

function WantCard({ wine, onRemove }: { wine: Wine; onRemove: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [bought, setBought] = useState(false);
  const name = [wine.name || wine.producer || 'Untitled wine', wine.name && vintageLabel(wine) && !wine.name.includes(vintageLabel(wine)) ? vintageLabel(wine) : '']
    .filter(Boolean)
    .join(' ');
  return (
    <article className="want-card lift">
      <Link to={`/wine/${wine.id}`} className="tile" aria-label={`Open ${name}`}>
        <BottleImage photo={wine.photo} alt="" />
      </Link>
      <div className="wc-body">
        {wine.name && wine.producer && <div className="pc-producer">{wine.producer}</div>}
        <Link to={`/wine/${wine.id}`} className="wc-name">
          {name}
        </Link>
        <div className="wc-price">
          {wine.price !== null && <strong>{formatPrice(wine.price)}</strong>}{' '}
          {wine.suggestion?.url ? (
            <a href={wine.suggestion.url} target="_blank" rel="noreferrer">
              {storeOf(wine)} <ArrowUpRight size={13} strokeWidth={1.6} />
            </a>
          ) : (
            <span>{storeOf(wine)}</span>
          )}
        </div>
        {wine.suggestion?.reason && <p className="wc-reason">{cleanReason(wine.suggestion.reason)}</p>}
      </div>
      <div className="wc-actions">
        <button
          type="button"
          className={`btn btn-dark${bought ? ' is-saved' : ''}`}
          disabled={bought}
          onClick={async () => {
            setBought(true);
            // Let the button bloom, then move it into the collection and go to its rating.
            await new Promise((r) => window.setTimeout(r, 650));
            await updateWine(wine.id, { list: null, owned: Math.max(1, wine.owned) });
            toast('Added to your collection — how was it?');
            navigate(`/wine/${wine.id}`);
          }}
        >
          {bought ? (
            <>
              <Check size={16} /> Added to your collection
            </>
          ) : (
            'Bought it — rate it'
          )}
        </button>
        <button type="button" className="icon-btn" onClick={onRemove} aria-label="Remove from Want to try">
          <X size={18} strokeWidth={1.7} />
        </button>
      </div>
    </article>
  );
}

export function WantPage() {
  const lists = useLists();
  const navigate = useNavigate();
  const removing = useUndo();
  const groups = useMemo(() => {
    const out = new Map<string, Wine[]>();
    for (const w of lists?.want ?? []) out.set(storeOf(w), [...(out.get(storeOf(w)) ?? []), w]);
    // Total Wine first, then the biggest lists.
    return [...out].sort((a, b) => Number(b[0] === 'Total Wine') - Number(a[0] === 'Total Wine') || b[1].length - a[1].length);
  }, [lists]);
  if (!lists) return null;
  const n = lists.want.length;

  return (
    <div className="want-page">
      <div className="page-top">
        <button type="button" className="icon-btn" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Back">
          <ChevronLeft size={22} strokeWidth={1.7} />
        </button>
      </div>
      <header className="want-intro">
        <div className="eyebrow">Want to try</div>
        <h1 className="headline want-headline">
          Bottles to <em>look for.</em>
        </h1>
        {n > 0 && (
          <p className="lede">
            {n} saved from your store picks. Tick one off when you buy it.
          </p>
        )}
      </header>

      {n === 0 ? (
        <div className="empty">
          <div className="art">
            <Bookmark size={36} strokeWidth={1.4} />
          </div>
          <h2>
            Nothing saved <em>yet.</em>
          </h2>
          <p>Tap “Want to try” on a store pick and it’s kept here, on your phone and computer.</p>
          <div className="actions">
            <Link to="/store" className="btn btn-wine">
              See store picks
            </Link>
          </div>
        </div>
      ) : (
        groups.map(([store, wines]) => (
          <section key={store} className="want-group" aria-label={`At ${store}`}>
            <div className="want-group-head">
              <h2>
                At <em>{store}</em>
              </h2>
              <span>
                {wines.length} {wines.length === 1 ? 'bottle' : 'bottles'}
              </span>
            </div>
            <div className="want-list">
              {wines.map((w) =>
                removing.isPending(w.id) ? (
                  <HiddenRow key={w.id} label={w.producer || w.name} onUndo={() => removing.undo(w.id)} />
                ) : (
                  <WantCard key={w.id} wine={w} onRemove={() => removing.start(w.id, () => deleteWine(w.id))} />
                ),
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
