import { ArrowUpRight, Bookmark, Check, ChevronLeft, ChevronRight, Heart, Plus, X } from 'lucide-react';
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMediaQuery } from '../hooks';
import { formatPrice, vintageLabel } from '../lib/format';
import { offerLabel } from '../lib/likeThis';
import { possessive, type StoreItem, type SuggestedItem } from '../lib/stores';
import type { StoreOffer, Wine } from '../types';
import { BottleImage, BottlePlaceholder } from './BottleImage';
import { useTrimmedPhoto } from './useTrimmedPhoto';

const GRID_MIN = 220;
const GRID_GAP = 28;

/** Desktop grid options for a row: at most two rows, an optional quiet "add" tile when there's room. */
export interface ShelfGrid {
  /** Shown in the heading when there's more than fits in two rows. */
  seeAll?: ReactNode;
  /** A tile that ends a short row. */
  filler?: ReactNode;
  /** How many rows to show (default 2). */
  rows?: number;
  /** Narrowest card, in px (default 220). */
  min?: number;
}

/**
 * A titled row of bottles ("Best bets", "Your shortlist"…). On a phone it scrolls sideways;
 * with `grid` on desktop (1024px and up) it becomes a grid that fills the width instead.
 */
export function ShelfRow({
  title,
  sub,
  action,
  below,
  arrows = false,
  grid,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  /** Something under the heading, such as a "New search" button. */
  below?: ReactNode;
  /** Previous/next buttons on desktop (rows that scroll). */
  arrows?: boolean;
  grid?: ShelfGrid;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery('(min-width: 1024px)');
  const asGrid = Boolean(grid) && wide;
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const el = scroller.current;
    if (!asGrid || !el) return;
    const min = grid?.min ?? GRID_MIN;
    const ro = new ResizeObserver(([e]) => setCols(Math.max(1, Math.floor((e.contentRect.width + GRID_GAP) / (min + GRID_GAP)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [asGrid, grid?.min]);
  const page = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const items = Children.toArray(children);
  const shown = asGrid ? items.slice(0, cols * (grid?.rows ?? 2)) : items;
  const more = asGrid && items.length > shown.length;
  const filler = asGrid && grid?.filler && items.length < cols ? grid.filler : null;

  return (
    <section className={`shelf${asGrid ? ' as-grid' : ''}`} aria-label={typeof title === 'string' ? title : undefined}>
      <div className="shelf-head">
        <div style={{ minWidth: 0 }}>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <div className="shelf-actions">
          {more ? grid?.seeAll ?? action : action}
          {arrows && !asGrid && (
            <span className="desktop-only shelf-arrows">
              <button type="button" className="icon-btn" onClick={() => page(-1)} aria-label="Scroll back">
                <ChevronLeft size={18} />
              </button>
              <button type="button" className="icon-btn" onClick={() => page(1)} aria-label="Scroll forward">
                <ChevronRight size={18} />
              </button>
            </span>
          )}
        </div>
      </div>
      {below && <div className="shelf-below">{below}</div>}
      <div
        className={asGrid ? 'shelf-grid' : 'shelf-scroll'}
        ref={scroller}
        style={asGrid && grid?.min ? { gridTemplateColumns: `repeat(auto-fill, minmax(${grid.min}px, 1fr))` } : undefined}
      >
        {shown}
        {filler}
      </div>
    </section>
  );
}

/** The quiet tile that ends a short row on desktop. */
export function FillerTile({ to, label, state }: { to: string; label: string; state?: unknown }) {
  return (
    <Link to={to} state={state} className="shelf-filler">
      <span className="tile filler-tile">
        <Plus size={26} strokeWidth={1.5} />
        <span>{label}</span>
      </span>
    </Link>
  );
}

/** One of your wines, small, on a burgundy-tinted shelf. */
export function MiniWineCard({ wine, note }: { wine: Wine; note?: string }) {
  const loved = !note && wine.rating === 'loved';
  return (
    <Link to={`/wine/${wine.id}`} className="mini-card lift">
      <div className="tile shelf-stage">
        <BottleImage photo={wine.photo} alt="" />
      </div>
      {/* The producer too: a cuvée alone ("Barolo", "Clásico") doesn't say which wine it is. */}
      {wine.producer && wine.name && <div className="pc-producer mini-p">{wine.producer}</div>}
      <div className={`mini-t${wine.producer && wine.name ? ' after-p' : ''}`}>{wine.name || wine.producer || 'Untitled wine'}</div>
      <div className={`mini-s${loved ? ' loved' : ''}`}>
        {loved ? (
          <>
            <Heart size={11} fill="currentColor" strokeWidth={0} /> Loved
          </>
        ) : (
          (note ?? (vintageLabel(wine) || ' '))
        )}
      </div>
    </Link>
  );
}

type Item = StoreItem | SuggestedItem;

/** The store's photo of this bottle; the silhouette if there's none or it won't load. */
export function StorePhoto({ src: original }: { src: string | null }) {
  const src = useTrimmedPhoto(original);
  const [failed, setFailed] = useState<string | null>(null);
  if (src === undefined) return null; // being trimmed
  if (!src || failed === src) return <BottlePlaceholder />;
  return <img className="bottle" src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(src)} />;
}

interface PickActions {
  saved: boolean;
  onWant: () => void;
  onPass: () => void;
}

/** What a pick card needs: the bottle and why. */
export interface PickLike {
  item: Item;
  reason: string;
  /** Producer and wine name, when known separately from the listing's title. */
  producer?: string;
  name?: string;
}

/** Reasons read better without dashes: a comma, or a full stop before a new sentence. Ranges like "$75–90" stay. */
export function cleanReason(text: string): string {
  return text.replace(/\s*—\s*|\s+–\s+/g, (m, offset: number, all: string) => (/[A-Z]/.test(all.charAt(offset + m.length)) ? '. ' : ', '));
}

/** Producer (eyebrow) and wine name (the big line), split where the listing allows. */
export function pickNames(pick: PickLike): { producer: string; name: string } {
  const s = pick.item as Partial<SuggestedItem>;
  const producer = pick.producer ?? s.producer ?? '';
  const wine = pick.name ?? s.wine ?? '';
  if (!producer || !wine) return { producer: '', name: pick.item.title };
  const vintage = pick.item.vintage !== null && !wine.includes(String(pick.item.vintage)) ? ` ${pick.item.vintage}` : '';
  return { producer, name: wine + vintage };
}

/** The dashed row left behind by "Not for me", with Undo. */
export function HiddenRow({ label, onUndo, card = false }: { label: string; onUndo: () => void; card?: boolean }) {
  return (
    <div className={`hidden-row${card ? ' as-card' : ''}`} role="status">
      <span>
        Hidden · <em>{label}</em>
      </span>
      <button type="button" className="text-link" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}

/** A store suggestion for scrolling rows (Best bets, Bottles like this). */
export function PickCard({ pick, saved, onWant, onPass, storeName, offers }: { pick: PickLike; storeName?: string; offers?: StoreOffer[] } & PickActions) {
  const { item } = pick;
  const { producer, name } = pickNames(pick);
  return (
    <div className="pick-card lift">
      <a href={item.url} target="_blank" rel="noreferrer" className="tile" aria-label={`${item.title} on the store’s website`}>
        <StorePhoto src={item.image} />
      </a>
      <div className="pc-body">
        <div className="pc-producer">{producer || ' '}</div>
        <div className="pc-name">{name}</div>
        {offers?.length ? (
          <div className="offers">
            {offers.slice(0, 3).map((o) => (
              <a key={o.storeId} href={o.url} target="_blank" rel="noreferrer">
                {offerLabel(o)}
              </a>
            ))}
          </div>
        ) : (
          <div className="pc-price">
            {item.price !== null && <strong>{formatPrice(item.price)}</strong>} {storeName && <span>{storeName}</span>}
          </div>
        )}
        <p className="pc-reason">{cleanReason(pick.reason)}</p>
      </div>
      <div className="pc-actions">
        <button
          type="button"
          className={`pc-want${saved ? ' is-saved' : ''}`}
          onClick={onWant}
          disabled={saved}
          aria-label={saved ? 'Saved to Want to try' : 'Want to try'}
        >
          {saved ? <Bookmark size={17} fill="currentColor" /> : <Bookmark size={17} strokeWidth={1.7} />}
          <span className="pc-label">{saved ? '✓ Saved' : 'Want to try'}</span>
        </button>
        <button type="button" className="pc-pass" onClick={onPass} aria-label="Not for me">
          <X size={16} strokeWidth={1.8} />
        </button>
        <a href={item.url} target="_blank" rel="noreferrer" className="pc-link" aria-label={`See it on ${storeName ? possessive(storeName) : 'the store’s'} website`}>
          <span className="pc-link-text">Link</span> <ArrowUpRight size={15} strokeWidth={1.6} />
        </a>
      </div>
    </div>
  );
}

/** A store suggestion as a full card, for the In store list. */
export function PickRow({
  pick,
  saved,
  onWant,
  onPass,
  storeName,
  domain,
  n,
}: { pick: PickLike; storeName: string; domain: string; n: number } & PickActions) {
  const { item } = pick;
  const { producer, name } = pickNames(pick);
  const size = item.sizeMl && item.sizeMl !== 750 ? (item.sizeMl >= 1000 ? `${item.sizeMl / 1000} L` : `${item.sizeMl} ml`) : '';
  // From an imported stock list: aisle, how many, deal and score.
  const shelf = item as Partial<SuggestedItem>;
  return (
    <article className="pick-row lift">
      <a href={item.url} target="_blank" rel="noreferrer" className="tile" aria-label={`${item.title} on ${possessive(storeName)} website`}>
        <StorePhoto src={item.image} />
      </a>
      <div className="pr-head">
        <div className="pr-no">No. {String(n).padStart(2, '0')}</div>
        {producer && <div className="pr-producer">{producer}</div>}
        <h3 className="pr-name">{name}</h3>
        <div className="pr-price">
          {item.price !== null ? formatPrice(item.price) : 'Price on website'}
          {size && <span className="pr-size"> · {size}</span>}
        </div>
        {(shelf.aisle || shelf.stock) && <div className="pr-stock">{[shelf.aisle, shelf.stock].filter(Boolean).join(' · ')}</div>}
        {(shelf.deal || shelf.score) && <div className="pr-deal">{[shelf.deal, shelf.score].filter(Boolean).join(' · ')}</div>}
        <a className="pr-link" href={item.url} target="_blank" rel="noreferrer">
          {storeName} · {domain} <ArrowUpRight size={14} strokeWidth={1.6} />
        </a>
      </div>
      <div className="pr-why">
        <div className="why-label">Why you’ll like it</div>
        <p className="reason">{cleanReason(pick.reason)}</p>
      </div>
      <div className="pr-actions">
        <button type="button" className={`btn btn-dark btn-lg${saved ? ' is-saved' : ''}`} onClick={onWant} disabled={saved}>
          {saved ? (
            <>
              <Check size={17} /> Saved<span className="desktop-inline"> to Want to try</span>
            </>
          ) : (
            <>
              <Bookmark size={17} strokeWidth={1.7} /> Want to try
            </>
          )}
        </button>
        <button type="button" className="btn btn-tone btn-lg" onClick={onPass}>
          Not for me
        </button>
        <a className="pr-link pr-link-wide" href={item.url} target="_blank" rel="noreferrer">
          {storeName} · {domain} <ArrowUpRight size={14} strokeWidth={1.6} />
        </a>
      </div>
    </article>
  );
}
