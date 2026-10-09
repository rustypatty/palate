import { ChevronLeft, Heart } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAllWines } from '../hooks';
import { producerAndName } from '../lib/format';
import { buildPassport, type NextStep, type Stamp } from '../lib/passport';

/** A place or grape you've tasted: loved ones marked, tapping opens the bottle (or the first one). */
function StampChip({ stamp }: { stamp: Stamp }) {
  return (
    <Link
      to={`/wine/${stamp.wines[0].id}`}
      className={`stamp${stamp.loved ? ' loved' : ''}`}
      title={stamp.wines.map(producerAndName).join(', ')}
    >
      {stamp.loved > 0 && <Heart size={13} strokeWidth={2} fill="currentColor" aria-label="loved" />}
      {stamp.name}
      {stamp.tried > 1 && <span className="stamp-n">×{stamp.tried}</span>}
    </Link>
  );
}

function NextCard({ step }: { step: NextStep }) {
  return (
    <article className="next-card">
      <div className="eyebrow">{step.kind === 'neighbour' ? 'Next door' : step.kind === 'grape' ? 'Same grape, new place' : 'A classic to meet'}</div>
      <h3 className="next-title">{step.title}</h3>
      <p className="small">{step.why}</p>
      {step.waiting.length > 0 && (
        <p className="next-waiting small">
          Start with{' '}
          {step.waiting.slice(0, 2).map((w, i) => (
            <span key={w.id}>
              {i > 0 && ' or '}
              <Link to={`/wine/${w.id}`}>{producerAndName(w)}</Link>
            </span>
          ))}
          , {step.waiting[0].list === 'want' ? 'on your Want to try list' : 'already in your cellar'}.
        </p>
      )}
      <div className="next-try">
        <span className="small muted">Look for</span>
        {step.tryThese.map((n) => (
          <span key={n} className="stamp todo">
            {n}
          </span>
        ))}
      </div>
    </article>
  );
}

/** Your wine passport: where you've been, what you loved, where to go next. Free, worked out on the device. */
export function PassportPage() {
  const all = useAllWines();
  const navigate = useNavigate();
  const p = useMemo(() => (all ? buildPassport(all) : null), [all]);
  if (!p) return null;

  return (
    <div className="passport-page">
      <div className="page-top">
        <button type="button" className="icon-btn" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/profile'))} aria-label="Back">
          <ChevronLeft size={22} strokeWidth={1.7} />
        </button>
      </div>

      <header className="passport-intro">
        <div className="eyebrow">
          {p.tasted} tasted · {p.places.length} {p.places.length === 1 ? 'region' : 'regions'} · {p.grapes.length} {p.grapes.length === 1 ? 'grape' : 'grapes'} ·{' '}
          {p.countries.length} {p.countries.length === 1 ? 'country' : 'countries'}
        </div>
        <h1 className="headline">
          Your wine <em>passport</em>
        </h1>
      </header>

      {p.tasted === 0 ? (
        <div className="tone-card">
          <div className="tone-title">No stamps yet</div>
          <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
            Rate a bottle you’ve tasted and its region and grapes go in your passport.
          </p>
        </div>
      ) : (
        <>
          {p.next.length > 0 && (
            <section className="passport-section">
              <h2 className="title-lg">Where to next</h2>
              <div className="next-list">
                {p.next.map((step) => (
                  <NextCard key={step.title} step={step} />
                ))}
              </div>
            </section>
          )}

          <section className="passport-section">
            <h2 className="title-lg">Places</h2>
            <div className="place-list">
              {p.places.map((place) => (
                <article key={place.name} className="place-card">
                  <div className="place-head">
                    <strong>{place.name}</strong>
                    <span className="small muted">
                      {place.country}
                      {place.country && ' · '}
                      {place.tried} tasted{place.loved > 0 ? ` · ${place.loved} loved` : ''}
                    </span>
                  </div>
                  <div className="stamps">
                    {place.stamps.map((s) => (
                      <StampChip key={s.name} stamp={s} />
                    ))}
                  </div>
                  {place.notYet.length > 0 && (
                    <div className="stamps">
                      <span className="small muted">Not yet</span>
                      {place.notYet.slice(0, 4).map((n) => (
                        <span key={n} className="stamp todo">
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="passport-section">
            <h2 className="title-lg">Grapes</h2>
            <div className="stamps">
              {p.grapes.map((g) => (
                <StampChip key={g.name} stamp={g} />
              ))}
            </div>
            {p.classicsNotYet.length > 0 && (
              <div className="stamps" style={{ marginTop: 12 }}>
                <span className="small muted">Classics not yet</span>
                {p.classicsNotYet.map((g) => (
                  <span key={g} className="stamp todo">
                    {g}
                  </span>
                ))}
              </div>
            )}
          </section>

          <p className="footnote">Your stamps are the bottles you’ve rated. ♥ marks the ones you loved.</p>
        </>
      )}
    </div>
  );
}
