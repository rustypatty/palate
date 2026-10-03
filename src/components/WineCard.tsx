import { Link } from 'react-router-dom';
import { STYLE_LABEL } from '../lib/constants';
import { formatPrice, fullName, vintageLabel } from '../lib/format';
import type { Wine } from '../types';
import { BottleGlyph, BottleImage } from './BottleImage';
import { RatingBadge } from './Rating';

export function WineCard({ wine, eager }: { wine: Wine; eager?: boolean }) {
  const place = wine.region || wine.country || (wine.style ? STYLE_LABEL[wine.style] : '');
  return (
    <Link to={`/wine/${wine.id}`} className="card" aria-label={fullName(wine) || 'Untitled wine'}>
      <div className="tile">
        <BottleImage photo={wine.photo} alt="" eager={eager} />
        {wine.rating && <RatingBadge rating={wine.rating} />}
        {wine.owned > 0 && (
          <span className="owned-badge" title={`${wine.owned} in your cellar`}>
            <BottleGlyph />
            {wine.owned}
            <span className="sr-only"> in your cellar</span>
          </span>
        )}
      </div>
      <div className="card-body">
        <div className="card-producer">{wine.producer || ' '}</div>
        <div className="card-name">{wine.name || wine.producer || 'Untitled wine'}</div>
        <div className="card-meta">
          <span>{[vintageLabel(wine), place].filter(Boolean).join(' · ')}</span>
          {wine.price !== null && <span className="price">{formatPrice(wine.price)}</span>}
        </div>
      </div>
    </Link>
  );
}

export function WineRow({ wine }: { wine: Wine }) {
  return (
    <Link to={`/wine/${wine.id}`} className="row-card">
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
