import { ChevronLeft, X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { CellarLink } from '../lib/learn';
import type { LessonCard, Wine, WineLesson } from '../types';
import { BottleImage } from './BottleImage';
import { cleanReason } from './Shelf';

/** The last card looked at, per wine, for this session: reopening picks up where you were. */
const lastCard = new Map<string, number>();

const SLIDE_MS = 500;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

interface Card {
  eyebrow: string;
  big: string;
  title: string;
  body: string;
  term: string;
  tone: string;
}

/** The four cards from the lesson; older lessons without headlines get a plain big word instead. */
function cardsOf(wine: Wine, l: WineLesson): Card[] {
  const heads: (LessonCard | undefined)[] = l.cards ?? [];
  const card = (i: number, eyebrow: string, body: string, fallback: string, tone: string): Card => ({
    eyebrow,
    big: heads[i]?.big.trim() || fallback,
    title: heads[i]?.title.trim() ?? '',
    body: cleanReason(body),
    term: heads[i]?.term.trim() ?? '',
    tone,
  });
  return [
    card(0, 'The grape', l.grape, wine.grapes[0] || 'The grape', 'grape'),
    card(1, 'The place', l.place, wine.region.trim() || wine.country.trim() || 'The place', 'place'),
    card(2, 'How it’s made', l.making, 'In the cellar', 'making'),
    card(3, 'Taste for it', l.tasteFor, 'Notice…', 'taste'),
  ];
}

/** "Also from Rioja" → "Also Rioja", "Elsewhere in Southern Rhône" → "Also Southern Rhône". */
const shortWhy = (label: string) => label.replace(/^Also from /, 'Also ').replace(/^Elsewhere in /, 'Also ');

/**
 * "Why it tastes like this" as four short cards in a sheet: the grape, the place, how it's made,
 * and what to taste for (with bottles from your cellar to compare). A bottom sheet on a phone,
 * a centred card on a computer. Swipe, arrow keys or Next to move; swipe the handle down, tap
 * outside, Esc or × to close.
 */
export function LessonSheet({ wine, lesson, links, onClose }: { wine: Wine; lesson: WineLesson; links: CellarLink[]; onClose: () => void }) {
  const navigate = useNavigate();
  const cards = cardsOf(wine, lesson);
  const compare = links.flatMap((l) => l.wines.map((w) => ({ wine: w, why: shortWhy(l.label) }))).slice(0, 3);
  const [index, setIndex] = useState(() => Math.min(lastCard.get(wine.id) ?? 0, cards.length - 1));
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const go = (i: number) => {
    const next = Math.max(0, Math.min(cards.length - 1, i));
    lastCard.set(wine.id, next);
    setIndex(next);
  };

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    setDrag(0);
    window.setTimeout(() => onCloseRef.current(), reducedMotion() ? 200 : SLIDE_MS);
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Next frame: start from below (or faded) so the sheet slides in.
    const raf = requestAnimationFrame(() => setShown(true));
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      else if (e.key === 'ArrowRight') go(indexRef.current + 1);
      else if (e.key === 'ArrowLeft') go(indexRef.current - 1);
      else if (e.key === 'Tab' && sheetRef.current) {
        // Keep focus inside the sheet.
        const f = [...sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')].filter((el) => el.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  // Swipe the handle down to close.
  const handleStart = useRef<number | null>(null);
  const onHandleDown = (e: ReactPointerEvent) => {
    handleStart.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: ReactPointerEvent) => {
    if (handleStart.current !== null) setDrag(Math.max(0, e.clientY - handleStart.current));
  };
  const onHandleUp = () => {
    if (handleStart.current === null) return;
    handleStart.current = null;
    if (drag > 90) close();
    else setDrag(0);
  };

  // Swipe the card sideways to move between cards (vertical scrolling inside a card still works).
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onCardDown = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onCardUp = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(index + (dx < 0 ? 1 : -1));
  };

  const last = index === cards.length - 1;
  return createPortal(
    <div className={`lesson-layer${shown ? ' open' : ''}`}>
      <div className="lesson-backdrop" onClick={close} aria-hidden="true" />
      <div
        ref={sheetRef}
        className="lesson-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Why it tastes like this"
        tabIndex={-1}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
      >
        <div className="lesson-grab" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}>
          <span />
        </div>
        <div className="lesson-top">
          <div className="lesson-progress" aria-label={`Card ${index + 1} of ${cards.length}`}>
            {cards.map((c, i) => (
              <span key={c.eyebrow} className={i <= index ? 'done' : ''} />
            ))}
          </div>
          <button type="button" className="lesson-close" onClick={close} aria-label="Close">
            <X size={16} strokeWidth={1.9} />
          </button>
        </div>
        <div className="lesson-cards" onPointerDown={onCardDown} onPointerUp={onCardUp} onPointerCancel={() => (swipe.current = null)}>
          {cards.map((c, i) => (
            <article
              key={c.eyebrow}
              className={`lesson-card${i === index ? ' current' : i < index ? ' before' : ' after'}`}
              aria-hidden={i !== index}
              inert={i !== index ? true : undefined}
            >
              <div className={`lesson-head ${c.tone}`}>
                <div className="lesson-eyebrow">
                  <span>{c.eyebrow}</span>
                  <span className="lesson-n">
                    {i + 1} of {cards.length}
                  </span>
                </div>
                <div className="lesson-big">{c.big}</div>
              </div>
              <div className="lesson-body">
                {c.title && <h3 className="lesson-title">{c.title}</h3>}
                <p className="lesson-text">{c.body}</p>
                {c.term && <p className="lesson-term">{c.term}</p>}
                {i === cards.length - 1 && compare.length > 0 && (
                  <div className="lesson-compare">
                    {compare.map(({ wine: w, why }) => (
                      <button
                        key={w.id}
                        type="button"
                        className="compare-tile"
                        onClick={() => {
                          close();
                          navigate(`/wine/${w.id}`);
                        }}
                      >
                        <span className="compare-photo">
                          <BottleImage photo={w.photo} alt="" />
                        </span>
                        <span className="compare-name">{w.name || w.producer}</span>
                        <span className="compare-why">{why}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        <div className="lesson-nav">
          <button type="button" className="lesson-back" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous card">
            <ChevronLeft size={18} strokeWidth={1.9} />
          </button>
          <button type="button" className="lesson-next" onClick={() => (last ? close() : go(index + 1))}>
            {last ? 'Done' : `Next · ${cards[index + 1].eyebrow}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
