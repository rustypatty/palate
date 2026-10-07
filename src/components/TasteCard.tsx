import { Fragment, type ReactNode } from 'react';
import type { TasteProfile } from '../lib/taste';
import { MIN_RATED } from '../lib/taste';

/** Put the places you love in italics inside the summary sentence. */
function emphasise(line: string, words: string[]): ReactNode {
  const hits = words.filter((w) => w && line.includes(w)).sort((a, b) => b.length - a.length);
  if (!hits.length) return line;
  const re = new RegExp(`(${hits.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
  return line.split(re).map((part, i) => (hits.includes(part) ? <em key={i}>{part}</em> : <Fragment key={i}>{part}</Fragment>));
}

/** "Your taste", in plain language, in the golden header of My palate. */
export function TasteHeader({ taste, favouriteRed = '' }: { taste: TasteProfile; favouriteRed?: string }) {
  if (!taste.enough && !favouriteRed) {
    const left = MIN_RATED - taste.rated;
    return (
      <header className="palate-hero">
        <div className="eyebrow">My palate · from {taste.rated} rated wines</div>
        <h1 className="palate-summary">
          Rate {left} more {left === 1 ? 'wine' : 'wines'} and Palate will <em>describe your taste.</em>
        </h1>
        <p className="palate-more">Every “Loved it” and “Wouldn’t buy again” sharpens it — and switches on store suggestions.</p>
      </header>
    );
  }
  // What you said is your favourite leads; the patterns counted from your ratings follow.
  const counted = taste.enough ? taste.summary.filter((l) => !l.startsWith('In your words')) : [];
  const lines = favouriteRed ? [`${favouriteRed} is your favourite red.`, ...counted] : counted;
  const places = taste.likes.filter((a) => a.kind === 'region' || a.kind === 'area').map((a) => a.value);
  return (
    <header className="palate-hero">
      <div className="eyebrow">My palate · from {taste.rated} rated wines</div>
      {lines[0] && <h1 className="palate-summary">{emphasise(lines[0], favouriteRed ? [favouriteRed, ...places] : places)}</h1>}
      {lines.length > 1 && <p className="palate-more">{lines.slice(1).join(' ')}</p>}
    </header>
  );
}

/** The first thing you said you're after, as a pull quote. */
export function TasteQuote({ taste }: { taste: TasteProfile }) {
  const wish = taste.wishes[0];
  if (!wish) return null;
  return (
    <figure className="pull-quote">
      <span className="mark" aria-hidden="true">
        “
      </span>
      <blockquote>{wish.replace(/[“”"]/g, '')}</blockquote>
      <figcaption className="eyebrow">In your words</figcaption>
    </figure>
  );
}
