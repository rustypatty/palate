import { ArrowLeft, Globe, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BottleImage } from '../components/BottleImage';
import { Stepper } from '../components/Inputs';
import { RatingPicker } from '../components/Rating';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { deleteWine, updateWine } from '../db';
import { useWine } from '../hooks';
import { RATING_LABEL, STYLE_LABEL } from '../lib/constants';
import { formatDate, formatPrice, fullName, placeLabel } from '../lib/format';

export function WineDetailPage() {
  const { id } = useParams();
  const wine = useWine(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (wine === undefined) return null;
  if (wine === null) {
    return (
      <div className="empty">
        <h2>Wine not found</h2>
        <p>It may have been deleted.</p>
        <Link to="/" className="btn btn-secondary">
          Back to my wines
        </Link>
      </div>
    );
  }

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  const title = wine.name || wine.producer || 'Untitled wine';
  const facts: [string, string][] = [
    ['Vintage', wine.vintage === null ? '' : String(wine.vintage)],
    ['Style', wine.style ? STYLE_LABEL[wine.style] : ''],
    ['Country', wine.country],
    ['Region', wine.region],
    ['Grapes', wine.grapes.join(', ')],
    ['Price', wine.price !== null ? formatPrice(wine.price) : ''],
    ['Bought at', wine.store],
    ['Tasted', wine.tastedOn ? formatDate(wine.tastedOn) : ''],
    ['Barcode', wine.barcode],
  ];
  const shown = facts.filter(([, v]) => v);

  return (
    <div className="detail">
      <div className="hero">
        <BottleImage photo={wine.photo} alt={`Bottle of ${fullName(wine)}`} eager />
        <div className="hero-actions">
          <button type="button" className="icon-btn on-image" onClick={back} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <Link to={`/wine/${wine.id}/edit`} className="icon-btn on-image" aria-label="Edit wine">
            <Pencil size={18} />
          </Link>
        </div>
        {!wine.photo && (
          <Link to={`/wine/${wine.id}/edit`} state={{ findPhoto: true }} className="btn btn-outline btn-sm hero-cta">
            <Globe size={16} /> Find a photo
          </Link>
        )}
        {wine.photo?.source && wine.photo.source.name !== 'Your photo' && (
          <a className="hero-credit" href={wine.photo.source.pageUrl} target="_blank" rel="noreferrer">
            Photo: {wine.photo.source.name}
          </a>
        )}
      </div>

      <div style={{ display: 'grid', gap: 22 }}>
        <div className="detail-title">
          {wine.producer && wine.name && <div className="producer">{wine.producer}</div>}
          <h1>{title}</h1>
          <div className="meta">
            <span>{[wine.vintage !== null ? String(wine.vintage) : null, placeLabel(wine)].filter(Boolean).join(' · ')}</span>
            {wine.price !== null && <span className="price-tag">{formatPrice(wine.price)}</span>}
          </div>
        </div>

        <div>
          <RatingPicker
            value={wine.rating}
            onChange={async (rating) => {
              await updateWine(wine.id, { rating, tastedOn: wine.tastedOn ?? (rating ? new Date().toISOString().slice(0, 10) : null) });
              toast(rating ? RATING_LABEL[rating] : 'Rating cleared');
            }}
          />
        </div>

        <div className="row-between section">
          <div>
            <div style={{ fontWeight: 700 }}>In my cellar</div>
            <div className="muted small">{wine.owned === 0 ? 'None on hand' : `${wine.owned} ${wine.owned === 1 ? 'bottle' : 'bottles'} on hand`}</div>
          </div>
          <Stepper value={wine.owned} onChange={(owned) => updateWine(wine.id, { owned })} label="bottles owned" />
        </div>

        <div className="section">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Tasting notes</h2>
            <Link to={`/wine/${wine.id}/edit`} className="btn btn-ghost btn-sm">
              <Pencil size={14} /> Edit
            </Link>
          </div>
          {wine.notes ? <p className="notes">{wine.notes}</p> : <p className="notes muted">No notes yet. What did you think?</p>}
        </div>

        {shown.length > 0 && (
          <div className="section">
            <h2>Details</h2>
            <dl className="facts">
              {shown.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="detail-footer section">
          <Link to={`/wine/${wine.id}/edit`} className="btn btn-dark">
            <Pencil size={16} /> Edit details
          </Link>
          <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>

      {confirmDelete && (
        <Sheet
          title="Delete this wine?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: 'var(--danger)' }}
                onClick={async () => {
                  await deleteWine(wine.id);
                  toast('Wine deleted');
                  navigate('/', { replace: true });
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            {fullName(wine) || 'This wine'}, its photo and notes will be removed from this device. This can’t be undone.
          </p>
        </Sheet>
      )}
    </div>
  );
}
