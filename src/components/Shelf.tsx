import { Bookmark, BookmarkCheck, ExternalLink, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatPrice, vintageLabel } from '../lib/format';
import { offerLabel } from '../lib/likeThis';
import { possessive, type StoreItem, type SuggestedItem } from '../lib/stores';
import type { StoreOffer, Wine } from '../types';
import { BottleImage, BottlePlaceholder } from './BottleImage';
import { RatingBadge } from './Rating';

/** A titled, horizontally scrolling row ("Buy again", "Want to try"…). */
export function ShelfRow({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="shelf" aria-label={title}>
      <div className="shelf-head">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </div>
      <div className="shelf-scroll">{children}</div>
    </section>
  );
}

/** One of your wines, small. */
export function MiniWineCard({ wine, note }: { wine: Wine; note?: string }) {
  return (
    <Link to={`/wine/${wine.id}`} className="mini-card">
      <div className="tile">
        <BottleImage photo={wine.photo} alt="" />
        {wine.rating && <RatingBadge rating={wine.rating} />}
      </div>
      <div className="mini-t">{wine.name || wine.producer || 'Untitled wine'}</div>
      <div className="mini-s">{note ?? ([wine.name ? wine.producer : '', vintageLabel(wine)].filter(Boolean).join(' · ') || ' ')}</div>
    </Link>
  );
}

type Item = StoreItem | SuggestedItem;

/** The store's photo of this bottle; the plain placeholder if there's none or it won't load. */
function StorePhoto({ src }: { src: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <BottlePlaceholder />;
  return <img className="bottle" src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(src)} />;
}

function itemPhoto(item: Item) {
  return <StorePhoto src={item.image} />;
}

interface PickActions {
  saved: boolean;
  onWant: () => void;
  onPass: () => void;
}

/** A store suggestion, small, for scrolling rows. */
/** What a pick card needs: the bottle and why. */
export interface PickLike {
  item: Item;
  reason: string;
}

export function PickCard({ pick, saved, onWant, onPass, storeName, offers }: { pick: PickLike; storeName?: string; offers?: StoreOffer[] } & PickActions) {
  const { item } = pick;
  return (
    <div className="mini-card pick-card">
      <a href={item.url} target="_blank" rel="noreferrer" className="tile" aria-label={`${item.title} on the store’s website`}>
        {itemPhoto(item)}
      </a>
      <div className="mini-t">{item.title}</div>
      {offers?.length ? (
        <div className="offers">
          {offers.slice(0, 3).map((o) => (
            <a key={o.storeId} href={o.url} target="_blank" rel="noreferrer">
              {offerLabel(o)}
            </a>
          ))}
        </div>
      ) : (
        <div className="mini-s">{[item.price !== null ? formatPrice(item.price) : '', storeName].filter(Boolean).join(' · ') || ' '}</div>
      )}
      <div className="pick-reason">{pick.reason}</div>
      <div className="pick-actions">
        <button type="button" className={`pick-btn${saved ? ' on' : ''}`} onClick={onWant} disabled={saved} aria-label={saved ? 'On your Want to try list' : 'Want to try'}>
          {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
        </button>
        <button type="button" className="pick-btn" onClick={onPass} aria-label="Not for me">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/** A store suggestion as a full-width row, for the In-store list. */
export function PickRow({ pick, saved, onWant, onPass, storeName }: { pick: PickLike; storeName: string } & PickActions) {
  const { item } = pick;
  const size = item.sizeMl && item.sizeMl !== 750 ? (item.sizeMl >= 1000 ? `${item.sizeMl / 1000} L` : `${item.sizeMl} ml`) : '';
  return (
    <div className="pick-row">
      <a href={item.url} target="_blank" rel="noreferrer" className="tile" aria-label={`${item.title} on ${possessive(storeName)} website`}>
        {itemPhoto(item)}
      </a>
      <div className="body">
        <div className="t">{item.title}</div>
        <div className="s">{[item.price !== null ? formatPrice(item.price) : '', size].filter(Boolean).join(' · ')}</div>
        <div className="pick-reason">{pick.reason}</div>
        <div className="pick-row-actions">
          <button type="button" className={`btn btn-sm ${saved ? 'btn-ghost' : 'btn-outline'}`} onClick={onWant} disabled={saved}>
            {saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />} {saved ? 'Saved' : 'Want to try'}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onPass}>
            <X size={15} /> Not for me
          </button>
          <a href={item.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost" aria-label={`Check stock on ${possessive(storeName)} website`} title="Check stock">
            <ExternalLink size={15} />
          </a>
        </div>
      </div>
    </div>
  );
}
