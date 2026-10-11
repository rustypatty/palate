import { Check as CheckIcon, ChevronLeft, Shuffle, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BottleImage, BottlePlaceholder } from '../components/BottleImage';
import { RatingPicker } from '../components/Rating';
import { Stepper } from '../components/Inputs';
import { useAllWines } from '../hooks';
import {
  blindCandidates,
  checkGuess,
  countryChoices,
  emptyGuess,
  explainBlind,
  grapeChoices,
  NOTICED,
  PRICE_LABEL,
  regionChoices,
  revealNotes,
  saveBlind,
} from '../lib/blind';
import { RATING_LABEL, STYLE_LABEL } from '../lib/constants';
import { fullName } from '../lib/format';
import { hasApiKey } from '../lib/labelReader';
import type { BlindGuess, BlindPrice, Rating, WineStyle } from '../types';

const STYLES: WineStyle[] = ['red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified'];
const PRICES: BlindPrice[] = ['under20', '20to40', 'over40'];

/** A tasting in progress, kept for the session so a reload doesn't give the bottle away or lose the guesses. */
interface Progress {
  wineId: string;
  guess: BlindGuess;
  rating: Rating | null;
  /** Set once revealed: which tasting on the wine is this one. */
  revealedAt: number | null;
}
const KEY = 'palate.blind';
function load(): Progress | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Progress) : null;
  } catch {
    return null;
  }
}
function store(p: Progress | null) {
  try {
    if (p) sessionStorage.setItem(KEY, JSON.stringify(p));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the tasting just isn't kept across a reload */
  }
}

/** Blind tasting: hide a bottle from your cellar, guess what it is, rate it, reveal. */
export function BlindPage() {
  const navigate = useNavigate();
  const all = useAllWines();
  const [progress, setProgress] = useState<Progress | null>(load);
  useEffect(() => store(progress), [progress]);

  const wine = all?.find((w) => w.id === progress?.wineId) ?? null;
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/passport'));
  if (!all) return null;

  const start = (wineId: string) => setProgress({ wineId, guess: emptyGuess(), rating: null, revealedAt: null });
  const reset = () => setProgress(null);

  return (
    <div className="blind-page">
      <div className="page-top">
        <button type="button" className="icon-btn" onClick={back} aria-label="Back">
          <ChevronLeft size={22} strokeWidth={1.7} />
        </button>
      </div>
      {!progress || !wine ? (
        <Choose onStart={start} />
      ) : progress.revealedAt === null ? (
        <Guess
          progress={progress}
          onChange={(p) => setProgress({ ...progress, ...p })}
          onReveal={async () => {
            const t = await saveBlind(wine, progress.guess, progress.rating);
            setProgress({ ...progress, revealedAt: t.at });
          }}
          onQuit={reset}
        />
      ) : (
        <Reveal wineId={wine.id} at={progress.revealedAt} onAgain={reset} />
      )}
    </div>
  );
}

function Choose({ onStart }: { onStart: (wineId: string) => void }) {
  const all = useAllWines() ?? [];
  const bottles = useMemo(() => blindCandidates(all).sort((a, b) => fullName(a).localeCompare(fullName(b))), [all]);
  const [pouring, setPouring] = useState(false);

  return (
    <>
      <header className="blind-intro">
        <div className="eyebrow">{bottles.length} {bottles.length === 1 ? 'bottle' : 'bottles'} in your cellar</div>
        <h1 className="headline">
          Blind <em>tasting</em>
        </h1>
        <p className="lede">Taste first, guess the grape, place and vintage, rate it without the label, then reveal.</p>
      </header>

      {bottles.length === 0 ? (
        <div className="tone-card">
          <div className="tone-title">No bottles to hide yet</div>
          <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
            Blind tastings use bottles you own. Add one and come back.
          </p>
        </div>
      ) : (
        <div className="blind-start">
          <button type="button" className="btn btn-wine btn-lg" onClick={() => onStart(bottles[Math.floor(Math.random() * bottles.length)].id)}>
            <Shuffle size={18} /> Surprise me
          </button>
          <p className="small muted">Palate picks a bottle from your cellar and keeps it hidden until you reveal it.</p>
          {pouring ? (
            <div className="blind-pour">
              <div className="eyebrow">For whoever’s pouring</div>
              <div className="blind-pour-list">
                {bottles.map((w) => (
                  <button key={w.id} type="button" className="blind-pour-item" onClick={() => onStart(w.id)}>
                    {fullName(w)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button type="button" className="text-link" onClick={() => setPouring(true)}>
              Someone else is pouring: let them choose
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Chips<T extends string>({ label, options, value, onChange, show = (x) => x }: { label: string; options: readonly T[]; value: T | null; onChange: (v: T | null) => void; show?: (v: T) => string }) {
  return (
    <section className="blind-q">
      <h2 className="blind-q-title">{label}</h2>
      <div className="chip-group" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" className="chip" aria-pressed={value === o} onClick={() => onChange(value === o ? null : o)}>
            {show(o)}
          </button>
        ))}
        <button type="button" className="chip outline" aria-pressed={value === null} onClick={() => onChange(null)}>
          Not sure
        </button>
      </div>
    </section>
  );
}

function Guess({ progress, onChange, onReveal, onQuit }: { progress: Progress; onChange: (p: Partial<Progress>) => void; onReveal: () => Promise<void>; onQuit: () => void }) {
  const all = useAllWines() ?? [];
  const g = progress.guess;
  const set = (p: Partial<BlindGuess>) => onChange({ guess: { ...g, ...p } });
  const year = new Date().getFullYear();
  const [busy, setBusy] = useState(false);

  return (
    <>
      <header className="blind-intro">
        <div className="eyebrow">Bottle hidden</div>
        <h1 className="headline">
          What’s in <em>the glass?</em>
        </h1>
      </header>
      <div className="blind-hidden" aria-hidden="true">
        <BottlePlaceholder />
        <span className="blind-mark">?</span>
      </div>

      <Chips label="Colour" options={STYLES} value={g.style} show={(s) => STYLE_LABEL[s]} onChange={(style) => set({ style, grape: null })} />
      <Chips label="Grape" options={grapeChoices(g.style, all)} value={g.grape} onChange={(grape) => set({ grape })} />
      <Chips label="Country" options={countryChoices(all)} value={g.country} onChange={(country) => set({ country, region: null })} />
      {g.country && <Chips label="Region" options={regionChoices(g.country, all)} value={g.region} onChange={(region) => set({ region })} />}

      <section className="blind-q">
        <h2 className="blind-q-title">Vintage</h2>
        <div className="blind-vintage">
          {g.vintage === null ? (
            <button type="button" className="chip" onClick={() => set({ vintage: year - 3 })}>
              Guess a year
            </button>
          ) : (
            <>
              <Stepper value={g.vintage} min={1950} onChange={(v) => set({ vintage: Math.min(year, v) })} label="Vintage" />
              <button type="button" className="chip outline" onClick={() => set({ vintage: null })}>
                Not sure
              </button>
            </>
          )}
        </div>
      </section>

      <Chips label="Price" options={PRICES} value={g.price} show={(p) => PRICE_LABEL[p]} onChange={(price) => set({ price })} />

      <section className="blind-q">
        <h2 className="blind-q-title">What you notice</h2>
        <div className="chip-group" role="group" aria-label="What you notice">
          {NOTICED.map((n) => {
            const on = g.noticed.includes(n);
            return (
              <button key={n} type="button" className="chip" aria-pressed={on} onClick={() => set({ noticed: on ? g.noticed.filter((x) => x !== n) : [...g.noticed, n] })}>
                {n}
              </button>
            );
          })}
        </div>
      </section>

      <section className="blind-q">
        <h2 className="blind-q-title">Your rating, before you know</h2>
        <RatingPicker compact value={progress.rating} onChange={(rating) => onChange({ rating })} />
      </section>

      <div className="blind-actions">
        <button
          type="button"
          className="btn btn-dark btn-lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onReveal().finally(() => setBusy(false));
          }}
        >
          Reveal
        </button>
        <button type="button" className="btn btn-tone btn-lg" onClick={onQuit}>
          <X size={16} /> Stop
        </button>
      </div>
    </>
  );
}

function Reveal({ wineId, at, onAgain }: { wineId: string; at: number; onAgain: () => void }) {
  const all = useAllWines() ?? [];
  const wine = all.find((w) => w.id === wineId);
  const tasting = wine?.blind?.find((t) => t.at === at);
  const [explaining, setExplaining] = useState<{ status: 'idle' | 'busy' } | { status: 'error'; reason: string }>({ status: 'idle' });
  if (!wine || !tasting) return null;

  const checks = checkGuess(wine, tasting.guess);
  const notes = revealNotes(wine, tasting.guess, checks);
  const explain = async () => {
    setExplaining({ status: 'busy' });
    const out = await explainBlind(wine, tasting, all);
    setExplaining(out.ok ? { status: 'idle' } : { status: 'error', reason: out.reason });
  };

  return (
    <>
      <header className="blind-intro">
        <div className="eyebrow">Revealed{wine.producer && wine.name ? ` · ${wine.producer}` : ''}</div>
        <h1 className="headline">{[wine.name || wine.producer, wine.vintage ?? ''].filter(Boolean).join(' ')}</h1>
      </header>
      <div className="blind-reveal-bottle">
        <BottleImage photo={wine.photo} alt={`Bottle of ${fullName(wine)}`} eager />
      </div>

      <div className="blind-score">
        <strong>
          {tasting.right} of {tasting.of}
        </strong>
        <span className="small muted">right</span>
      </div>

      <div className="blind-checks" role="table" aria-label="Your guesses">
        {checks.map((c) => (
          <div key={c.key} className={`blind-check${c.right ? ' right' : ''}`} role="row">
            <span className="blind-check-label" role="cell">
              {c.label}
            </span>
            <span role="cell">
              <span className="blind-said">{c.said}</span>
              {!c.right && <span className="blind-was">{c.was}</span>}
            </span>
            <span className="blind-mark-cell" role="cell" aria-label={c.right ? 'Right' : 'Wrong'}>
              {c.right ? <CheckIcon size={18} /> : <X size={18} />}
            </span>
          </div>
        ))}
      </div>

      {notes.map((n) => (
        <p key={n} className="blind-note">
          {n}
        </p>
      ))}

      {tasting.explain ? (
        <section className="blind-explain">
          <div className="eyebrow">Why</div>
          <p>{tasting.explain.text}</p>
          <p className="blind-tip">{tasting.explain.tip}</p>
        </section>
      ) : hasApiKey() ? (
        <div className="blind-explain-ask">
          <button type="button" className="btn btn-tone" onClick={explain} disabled={explaining.status === 'busy'}>
            {explaining.status === 'busy' ? 'Explaining…' : 'Explain'}
          </button>
          <span className="small muted">{explaining.status === 'error' ? `Couldn’t explain (${explaining.reason}).` : 'Why it went the way it did · about 3¢'}</span>
        </div>
      ) : null}

      <p className="small muted">
        {tasting.rating ? `Your blind rating: ${RATING_LABEL[tasting.rating]}.` : 'No rating given.'}
        {tasting.rating && wine.rating === tasting.rating ? '' : wine.rating ? ` Its rating stays ${RATING_LABEL[wine.rating]}.` : ''}
      </p>

      <div className="blind-actions">
        <button type="button" className="btn btn-dark btn-lg" onClick={onAgain}>
          Another bottle
        </button>
        <Link to={`/wine/${wine.id}`} className="btn btn-tone btn-lg">
          Wine page
        </Link>
      </div>
    </>
  );
}
