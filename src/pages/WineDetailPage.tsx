import { BookmarkX, ChevronLeft, Globe, Pencil, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AboutWine } from '../components/AboutWine';
import { MoreLikeThis, SuggestionNote } from '../components/MoreLikeThis';
import { BottleImage } from '../components/BottleImage';
import { Stepper } from '../components/Inputs';
import { RatingPicker } from '../components/Rating';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { deleteWine, updateWine } from '../db';
import { useWine } from '../hooks';
import { RATING_LABEL, STYLE_LABEL } from '../lib/constants';
import { formatDate, formatPrice, fullName, placeLabel } from '../lib/format';
import { shownPhoto } from '../lib/image';
import { hasApiKey, LabelReadError, lookUpWine } from '../lib/labelReader';

/** Rough cost of looking up published notes (a few web searches and page reads). */
const NOTES_COST = '~10¢';

export function WineDetailPage() {
  const { id } = useParams();
  const wine = useWine(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fetching, setFetching] = useState(false);

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

  const canLookUp = hasApiKey() && Boolean(wine.producer || wine.name);

  const fetchNotes = async () => {
    setFetching(true);
    try {
      const outcome = await lookUpWine(
        {
          is_wine_label: true,
          producer: wine.producer,
          wine_name: wine.name,
          vintage: wine.vintage === null ? '' : String(wine.vintage),
          country: wine.country,
          region: wine.region,
          grapes: wine.grapes,
          style: wine.style ?? 'unknown',
          confidence: 'high',
          uncertain: '',
        },
        null,
      );
      if (!outcome.ok) {
        toast(`Couldn’t look this wine up (${outcome.reason}).`);
        return;
      }
      const l = outcome.lookup;
      if (!l.about) {
        toast('Couldn’t find published tasting notes for this wine.');
        return;
      }
      await updateWine(wine.id, {
        about: l.about,
        // Fill in only what's missing; never overwrite what's already there.
        ...(wine.grapes.length === 0 && l.grapes.length ? { grapes: l.grapes } : {}),
        ...(wine.style === null && l.style !== 'unknown' ? { style: l.style } : {}),
      });
      toast(`Tasting notes added from ${l.about.sourceName}`);
    } catch (e) {
      toast(e instanceof LabelReadError ? e.message : 'Couldn’t look up this wine. Try again.');
    } finally {
      setFetching(false);
    }
  };

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  const title = wine.name || wine.producer || 'Untitled wine';
  // Only when the name really starts with the region ("Châteauneuf-du-Pape Cuvée Réservée") is the rest set in italic.
  const region = wine.region.trim();
  const rest = region && title.startsWith(region + ' ') ? title.slice(region.length + 1).trim() : '';
  const split = rest ? [region, rest] : null;
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
  // Notes: the first short line reads as a quote, the rest as body text.
  const notes = wine.notes.trim();
  const lines = notes.split(/\n+/);
  const firstSentence = notes.match(/^.{3,90}?[.!?](?=\s|$)/)?.[0];
  const candidate = lines.length > 1 && lines[0].length <= 90 ? lines[0] : notes.length <= 90 ? notes : firstSentence ?? '';
  // Don't cut a quotation in half.
  const quote = (candidate.match(/["“”]/g)?.length ?? 0) % 2 ? '' : candidate.replace(/^["“](.*)["”]$/, '$1');
  const body = quote ? notes.slice(notes.indexOf(candidate) + candidate.length).trim() : notes;
  const credit = shownPhoto(wine.photo)?.source ?? null;

  return (
    <div className="detail">
      <div className="photo-stage">
        <div className="photo-bottle lift">
          <BottleImage photo={wine.photo} alt={`Bottle of ${fullName(wine)}`} eager />
        </div>
        <div className="hero-actions">
          <button type="button" className="icon-btn frost" onClick={back} aria-label="Back">
            <ChevronLeft size={22} strokeWidth={1.7} />
          </button>
          <Link to={`/wine/${wine.id}/edit`} className="icon-btn frost" aria-label="Edit wine">
            <Pencil size={18} strokeWidth={1.7} />
          </Link>
        </div>
        {!shownPhoto(wine.photo) && (
          <Link to={`/wine/${wine.id}/edit`} state={{ findPhoto: true }} className="btn btn-white btn-sm hero-cta">
            <Globe size={16} /> Find a photo
          </Link>
        )}
        {credit &&
          (credit.pageUrl ? (
            <a className="hero-credit" href={credit.pageUrl} target="_blank" rel="noreferrer">
              Photo · {credit.name}
            </a>
          ) : (
            <span className="hero-credit">Photo · {credit.name}</span>
          ))}
      </div>

      <div className="detail-body">
        <div className="detail-title">
          {wine.producer && wine.name && <div className="eyebrow">{wine.producer}</div>}
          <h1>
            {split ? (
              <>
                {split[0]} <em>{split[1]}</em>
              </>
            ) : (
              title
            )}
          </h1>
          <div className="meta">{[wine.vintage !== null ? String(wine.vintage) : null, placeLabel(wine)].filter(Boolean).join(' · ')}</div>
        </div>

        <SuggestionNote wine={wine} />

        {wine.list === 'want' && (
          <div className="detail-actions">
            <button
              type="button"
              className="btn btn-dark btn-lg"
              onClick={async () => {
                await updateWine(wine.id, { list: null, owned: Math.max(1, wine.owned) });
                toast('Added to your wines');
              }}
            >
              <ShoppingBag size={16} /> I bought it
            </button>
            <button
              type="button"
              className="btn btn-tone btn-lg"
              onClick={async () => {
                await deleteWine(wine.id);
                toast('Removed from Want to try');
                navigate(-1);
              }}
            >
              <BookmarkX size={16} /> Remove from list
            </button>
          </div>
        )}

        <div>
          {wine.list === 'want' && <p className="footnote" style={{ marginBottom: 10 }}>Tried it already? Rate it and it moves into your wines.</p>}
          <RatingPicker
            value={wine.rating}
            onChange={async (rating) => {
              await updateWine(wine.id, {
                rating,
                tastedOn: wine.tastedOn ?? (rating ? new Date().toISOString().slice(0, 10) : null),
                // Rated a Want to try wine: it's part of the collection now (keeping its suggestion).
                ...(rating && wine.list === 'want' ? { list: null } : {}),
              });
              toast(rating ? RATING_LABEL[rating] : 'Rating cleared');
            }}
          />
        </div>

        <div className="tone-card cellar-card">
          <div>
            <div className="cellar-title">In my cellar</div>
            <div className="small muted">{wine.owned === 0 ? 'None on hand' : `${wine.owned} ${wine.owned === 1 ? 'bottle' : 'bottles'} on hand`}</div>
          </div>
          <Stepper value={wine.owned} onChange={(owned) => updateWine(wine.id, { owned })} label="bottles owned" />
        </div>

        <section className="detail-section">
          <div className="section-head">
            <h2 className="eyebrow">My notes</h2>
            <Link to={`/wine/${wine.id}/edit`} className="text-link">
              Edit
            </Link>
          </div>
          {notes ? (
            <>
              {quote && <p className="notes-quote">“{quote}”</p>}
              {body && <p className="notes">{body}</p>}
            </>
          ) : (
            <p className="notes muted">No notes yet. What did you think?</p>
          )}
        </section>

        <section className="tone-card about-card">
          <h2 className="eyebrow">About this wine</h2>
          {wine.about ? (
            <AboutWine about={wine.about} />
          ) : (
            <>
              <p className="notes">{canLookUp ? 'No published tasting notes yet.' : 'Add your Anthropic API key in My palate to fetch published tasting notes.'}</p>
              {canLookUp && (
                <button type="button" className="btn btn-white" onClick={fetchNotes} disabled={fetching}>
                  {fetching ? 'Looking up…' : `Get tasting notes · ${NOTES_COST}`}
                </button>
              )}
            </>
          )}
        </section>

        {shown.length > 0 && (
          <section className="detail-section">
            <dl className="facts">
              {shown.map(([k, v]) => (
                <div key={k}>
                  <dt className="eyebrow">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <MoreLikeThis wine={wine} />

        <div className="detail-footer">
          <Link to={`/wine/${wine.id}/edit`} className="btn btn-dark btn-lg">
            Edit details
          </Link>
          <button type="button" className="btn btn-danger btn-lg" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </div>
      </div>

      {confirmDelete && (
        <Sheet
          title="Delete this wine?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button type="button" className="btn btn-tone" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <button
                type="button"
                className="btn btn-dark"
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
