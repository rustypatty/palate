import { ArrowUpRight, ChevronLeft } from 'lucide-react';
import { useMemo, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BottleImage } from '../components/BottleImage';
import { BellIcon, WatchBell } from '../components/PriceWatch';
import { ago } from '../components/StorePicks';
import { useToast } from '../components/Toast';
import { useAllWines } from '../hooks';
import { formatPrice } from '../lib/format';
import { hasApiKey } from '../lib/labelReader';
import { priceCheck, runPriceCheck } from '../lib/priceCheck';
import { dropReason, lastCheckedAt, latestPrice, priceDrops, storesSeen, watchedWines, type Drop } from '../lib/priceWatch';
import { usePriceCheckedAt } from '../lib/usePicks';
import type { Wine } from '../types';

const nameOf = (w: Wine) => [w.name || w.producer || 'Untitled wine', w.vintage ?? ''].filter(Boolean).join(' ');

/** A price drop: photo, producer, name, new price, old price struck through, store, reason and link. */
export function DropCard({ drop }: { drop: Drop }) {
  const { wine, now, was } = drop;
  return (
    <article className="drop-card lift">
      <Link to={`/wine/${wine.id}`} className="drop-tile" aria-label={`Open ${nameOf(wine)}`}>
        <BottleImage photo={wine.photo} alt="" />
      </Link>
      <div className="drop-body">
        {wine.producer && wine.name && <div className="pc-producer">{wine.producer}</div>}
        <Link to={`/wine/${wine.id}`} className="drop-name">
          {nameOf(wine)}
        </Link>
        <div className="drop-price">
          <strong>{formatPrice(now.price)}</strong>
          {was !== null && was > now.price && <s>{formatPrice(was)}</s>}
          <span>{now.store}</span>
        </div>
        <div className="drop-foot">
          <span className="drop-reason">{dropReason(drop)}</span>
          <a href={now.url} target="_blank" rel="noreferrer" className="drop-link">
            Link <ArrowUpRight size={14} strokeWidth={1.7} />
          </a>
        </div>
      </div>
    </article>
  );
}

export function WatchPage() {
  const all = useAllWines();
  const navigate = useNavigate();
  const toast = useToast();
  const [local] = usePriceCheckedAt();
  const running = useSyncExternalStore(priceCheck.subscribe, priceCheck.running);
  const failed = useSyncExternalStore(priceCheck.subscribe, priceCheck.error);
  const watched = useMemo(() => (all ? watchedWines(all).sort((a, b) => nameOf(a).localeCompare(nameOf(b))) : []), [all]);
  const drops = useMemo(() => (all ? priceDrops(all) : []), [all]);
  if (!all) return null;
  const last = lastCheckedAt(watched, local);
  const stores = storesSeen(watched);
  const n = drops.length;
  const count = watched.length;

  const check = async () => {
    const r = await runPriceCheck(all);
    if (r.ok) toast(r.found ? `Checked ${r.watched} · found ${r.found} at your stores` : 'Checked · none found at your stores this time');
  };

  return (
    <div className="watch-page">
      <div className="page-top">
        <button type="button" className="icon-btn" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/profile'))} aria-label="Back">
          <ChevronLeft size={22} strokeWidth={1.7} />
        </button>
      </div>

      <header className="watch-intro">
        <div className="eyebrow">{last ? `Checked ${ago(last)}${stores.length ? ` · ${stores.join(', ')}` : ''}` : 'Price watch · not checked yet'}</div>
        <h1 className="headline">
          {n > 0 ? (
            <>
              {n} {n === 1 ? 'favourite' : 'favourites'} <em>got cheaper</em>
            </>
          ) : count > 0 && last ? (
            <>
              Nothing <em>cheaper yet</em>
            </>
          ) : (
            <>
              Price <em>watch</em>
            </>
          )}
        </h1>
      </header>

      {n > 0 && (
        <section className="drop-list" aria-label="Price drops">
          {drops.map((d) => (
            <DropCard key={d.wine.id} drop={d} />
          ))}
        </section>
      )}

      {count === 0 ? (
        <div className="tone-card watch-empty">
          <div className="tone-title">Nothing watched yet</div>
          <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
            Tap the <BellIcon size={15} /> bell on a wine you loved or a Want to try bottle, and Palate checks its price at your stores each week.
          </p>
        </div>
      ) : (
        <section className="watch-section" aria-label="Watching">
          <h2 className="title-lg">Watching</h2>
          <div className="watch-list">
            {watched.map((w) => {
              const p = latestPrice(w);
              return (
                <div key={w.id} className="watch-row">
                  <Link to={`/wine/${w.id}`} className="watch-bottle" aria-label={`Open ${nameOf(w)}`}>
                    <BottleImage photo={w.photo} alt="" />
                  </Link>
                  <div className="watch-text">
                    <Link to={`/wine/${w.id}`} className="watch-name">
                      {nameOf(w)}
                    </Link>
                    <div className="watch-now">
                      {p ? (
                        <>
                          {formatPrice(p.price)} now · {p.store}
                        </>
                      ) : last ? (
                        'Not found at your stores yet'
                      ) : (
                        'Not checked yet'
                      )}
                    </div>
                  </div>
                  <WatchBell wine={w} small />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {count > 0 && (
        <div className="watch-check">
          <p className="footnote">
            {count} {count === 1 ? 'bottle' : 'bottles'} watched · checked weekly
          </p>
          {hasApiKey() ? (
            <button type="button" className="btn btn-wine btn-lg" onClick={check} disabled={running}>
              {running ? 'Checking prices…' : 'Check now'}
            </button>
          ) : (
            <Link to="/profile" className="btn btn-tone btn-lg">
              Add your Anthropic key to check prices
            </Link>
          )}
          {failed && !running && <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>Couldn’t check: {failed}</p>}
        </div>
      )}
    </div>
  );
}
