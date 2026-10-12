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

/**
 * The golden header of My palate: your favourite (or what your ratings say most), one short
 * summary line, and whatever goes under it (the numbers row).
 */
export function TasteHeader({ taste, favouriteRed = '', summary = '', children }: { taste: TasteProfile; favouriteRed?: string; summary?: string; children?: ReactNode }) {
  const eyebrow = `My palate · ${taste.rated} rated ${taste.rated === 1 ? 'wine' : 'wines'}`;
  if (!taste.enough && !favouriteRed) {
    const left = MIN_RATED - taste.rated;
    return (
      <header className="palate-hero">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="palate-summary">
          Rate {left} more {left === 1 ? 'wine' : 'wines'} and Palate will <em>describe your taste.</em>
        </h1>
        <p className="palate-more">Every “Loved it” and “Wouldn’t buy again” sharpens it, and switches on store suggestions.</p>
        {children}
      </header>
    );
  }
  // What you said is your favourite leads; otherwise the strongest pattern counted from your ratings.
  const counted = taste.enough ? taste.summary.filter((l) => !l.startsWith('In your words')) : [];
  const headline = favouriteRed ? `${favouriteRed} is your favourite red.` : counted[0];
  const places = taste.likes.filter((a) => a.kind === 'region' || a.kind === 'area').map((a) => a.value);
  return (
    <header className="palate-hero">
      <div className="eyebrow">{eyebrow}</div>
      {headline && <h1 className="palate-summary">{emphasise(headline, favouriteRed ? [favouriteRed] : places)}</h1>}
      {summary && <p className="palate-more">{summary}</p>}
      {children}
    </header>
  );
}
