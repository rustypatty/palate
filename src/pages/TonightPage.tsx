import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { BottleImage } from '../components/BottleImage';
import { RatingPicker } from '../components/Rating';
import { useToast } from '../components/Toast';
import { updateWine } from '../db';
import { useWines } from '../hooks';
import { RATING_LABEL } from '../lib/constants';
import { fullName } from '../lib/format';
import { DISHES, nextIndex, rankTonight, saveForWeekend } from '../lib/tonight';
import { useTonightDish } from '../lib/usePicks';
import type { Wine } from '../types';

const UNDO_MS = 6000;

/** Tonight: pick a dish, get the bottle at home to open with it. Free, on the device. */
export function TonightPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const wines = useWines();
  const [dish, setDish] = useTonightDish();
  const [index, setIndex] = useState(0);
  // The bottle just opened stays on the stage (with Undo and "How was it?") until you move on.
  const [opened, setOpened] = useState<{ id: string; before: number; reason: string } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);

  const close = () => {
    const from = (location.state as { background?: Location } | null)?.background;
    if (from) navigate(-1);
    else navigate('/', { replace: true });
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(timer.current);
    };
  }, []);

  const ranked = useMemo(() => (wines ? rankTonight(wines, dish) : []), [wines, dish]);
  const atHome = useMemo(() => (wines ?? []).reduce((t, w) => t + (w.owned > 0 ? w.owned : 0), 0), [wines]);
  const openedWine = opened ? wines?.find((w) => w.id === opened.id) : undefined;
  const pick = ranked.length ? ranked[index % ranked.length] : null;
  const shown: Wine | null = openedWine ?? pick?.wine ?? null;
  const reason = (openedWine ? opened?.reason : pick?.reason) ?? '';
  const weekend = pick && !openedWine ? saveForWeekend(ranked, pick, dish) : null;
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  const choose = (d: typeof dish) => {
    setDish(d);
    setIndex(0);
    setOpened(null);
  };

  const another = () => {
    if (openedWine) {
      // Moving on from the opened bottle. If it was the last one, the next is already in its place.
      setOpened(null);
      setUndoing(false);
      window.clearTimeout(timer.current);
      if (pick?.wine.id !== openedWine.id) return;
    }
    setIndex((i) => nextIndex(i % Math.max(ranked.length, 1), ranked.length));
  };

  const openIt = async () => {
    if (!shown || openedWine) return;
    const before = shown.owned;
    await updateWine(shown.id, { owned: Math.max(0, before - 1) });
    setOpened({ id: shown.id, before, reason: pick?.reason ?? '' });
    setUndoing(true);
    // Bring "How was it?" into view, clear of the Undo toast.
    window.setTimeout(() => ref.current?.querySelector('.tonight-rate')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUndoing(false), UNDO_MS);
  };

  const undo = async () => {
    if (!opened) return;
    window.clearTimeout(timer.current);
    await updateWine(opened.id, { owned: opened.before });
    setOpened(null);
    setUndoing(false);
    toast('Back in your cellar');
  };

  const left = shown ? Math.max(0, shown.owned - 1) : 0;

  return createPortal(
    <div className="tonight-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={ref} className={`tonight${undoing && openedWine ? ' has-toast' : ''}`} role="dialog" aria-modal="true" aria-label="Tonight" tabIndex={-1}>
        <div className="tonight-top">
          <div className="eyebrow">
            {weekday} evening · {atHome} {atHome === 1 ? 'bottle' : 'bottles'} at home
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={20} strokeWidth={1.7} />
          </button>
        </div>
        <h1 className="headline tonight-title">
          What are you <em>cooking?</em>
        </h1>

        <div className="tonight-dishes" role="group" aria-label="Dish">
          {DISHES.map((d) => (
            <button key={d.id} type="button" className="chip" aria-pressed={dish === d.id} onClick={() => choose(d.id)}>
              {d.label}
            </button>
          ))}
        </div>

        {wines && !shown && (
          <div className="tonight-empty">
            <p className="lede">Nothing at home to open. Add a bottle you own and it’ll show up here.</p>
            <Link to="/add" state={{ draft: { owned: 1 } }} className="btn btn-tone">
              Add a bottle
            </Link>
          </div>
        )}

        {shown && (
          <>
            <Link to={`/wine/${shown.id}`} className="tonight-stage" aria-label={`Open ${fullName(shown)}`}>
              <span className="eyebrow tonight-stage-label">{openedWine ? 'Opened' : 'Open this one'}</span>
              <span className="tonight-bottle">
                <BottleImage photo={shown.photo} alt={`Bottle of ${fullName(shown)}`} eager />
              </span>
            </Link>

            <div className="tonight-text" aria-live="polite">
              {shown.producer && shown.name && <div className="eyebrow">{shown.producer}</div>}
              <h2 className="tonight-name">{[shown.name || shown.producer || 'Untitled wine', shown.vintage ?? ''].filter(Boolean).join(' ')}</h2>
              {reason && <p className="tonight-reason">{reason}</p>}
              <div className="tonight-meta">
                {shown.rating ? RATING_LABEL[shown.rating] : 'Not rated yet'} · {shown.owned} in your cellar
              </div>
            </div>

            <div className="tonight-actions">
              <button type="button" className={`btn btn-wine tonight-open${openedWine ? ' is-saved' : ''}`} disabled={Boolean(openedWine)} onClick={openIt}>
                {openedWine ? `Opened · ${shown.owned} left` : `Open it · ${left} left after`}
              </button>
              <button type="button" className="btn btn-tone tonight-another" onClick={another} disabled={!openedWine && ranked.length < 2}>
                Another
              </button>
            </div>

            {openedWine && (
              <div className="tonight-rate">
                <div className="tonight-rate-title">How was it?</div>
                <RatingPicker
                  compact
                  value={openedWine.rating}
                  onChange={(rating) =>
                    updateWine(openedWine.id, { rating, tastedOn: rating ? new Date().toISOString().slice(0, 10) : openedWine.tastedOn })
                  }
                />
              </div>
            )}

            {weekend && (
              <div className="tonight-weekend">
                <div className="tonight-weekend-title">Save for a weekend</div>
                <p>{weekend.text}</p>
              </div>
            )}
          </>
        )}

        <p className="footnote tonight-foot">Picked from your cellar · free</p>

        {undoing && openedWine && (
          <div className="undo-toast" role="status">
            <span>Opened {openedWine.name || openedWine.producer}. Enjoy.</span>
            <button type="button" className="text-link" onClick={undo}>
              Undo
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
