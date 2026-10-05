import { Link } from 'react-router-dom';
import { STYLE_LABEL } from '../lib/constants';
import { formatPrice, fullName, vintageLabel } from '../lib/format';
import type { Wine } from '../types';
import { BottleImage } from './BottleImage';
import { RatingBadge } from './Rating';

export function WineCard({ wine, eager }: { wine: Wine; eager?: boolean }) {
  const place = wine.region || wine.country || (wine.style ? STYLE_LABEL[wine.style] : '');
  return (
    <Link to={`/wine/${wine.id}`} className="card" aria-label={fullName(wine) || 'Untitled wine'}>
      <div className="tile">
        <BottleImage photo={wine.photo} alt="" eager={eager} />
        {wine.rating && <RatingBadge rating={wine.rating} />}
        {wine.owned > 0 && <span className="owned-badge">{wine.owned} in cellar</span>}
      </div>
      <div className="card-body">
        {wine.producer && wine.name && <div className="card-producer">{wine.producer}</div>}
        <div className="card-name">{wine.name || wine.producer || 'Untitled wine'}</div>
        <div className="card-meta">{[vintageLabel(wine), place].filter(Boolean).join(' · ') || ' '}</div>
      </div>
    </Link>
  );
}

/** A small row for lists: your safe bets, wines you've had. */
export function WineRow({ wine }: { wine: Wine }) {
  return (
    <Link to={`/wine/${wine.id}`} className="row-card lift">
      <div className="tile">
        <BottleImage photo={wine.photo} alt="" />
      </div>
      <div className="body">
        <div className="t">{wine.name || wine.producer || 'Untitled wine'}</div>
        <div className="s">
          {[wine.name ? wine.producer : null, vintageLabel(wine), wine.price !== null ? formatPrice(wine.price) : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      {wine.rating && <RatingBadge rating={wine.rating} />}
    </Link>
  );
}
