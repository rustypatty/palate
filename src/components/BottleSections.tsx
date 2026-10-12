import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWines } from '../hooks';
import { grapeCards, regionCard, structureOf } from '../lib/bottleSections';
import { DEFAULT_FILTERS } from '../lib/filters';
import { buildTaste } from '../lib/taste';
import type { Wine } from '../types';
import { GlassArt } from './GlassArt';
import { useProfile } from './ProfileImport';
import { Sheet } from './Sheet';

/** Five segments, the first `level` filled. */
function Bar({ level }: { level: number }) {
  return (
    <span className="structure-bar" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= level ? 'on' : ''} />
      ))}
    </span>
  );
}

/**
 * Structure, Grapes and Region, after your notes on a wine page. Built from Palate's own grape
 * and region guides and your ratings (no Claude call). A section with nothing reliable to say is
 * left out.
 */
export function BottleSections({ wine }: { wine: Wine }) {
  const wines = useWines();
  const profile = useProfile();
  const navigate = useNavigate();
  const [reading, setReading] = useState(false);
  const all = wines ?? [];
  const taste = useMemo(() => (wines ? buildTaste(wines) : null), [wines]);
  const structure = useMemo(() => structureOf(wine, profile), [wine, profile]);
  const grapes = useMemo(() => grapeCards(wine, all), [wine, wines]);
  const region = useMemo(() => regionCard(wine, all, taste), [wine, wines, taste]);

  if (wine.list === 'passed') return null;

  // "You've loved 3 Nebbiolo wines": your collection, Loved, searched for that grape.
  const showLoved = (grape: string) => {
    try {
      sessionStorage.setItem('palate.filters', JSON.stringify({ ...DEFAULT_FILTERS, shelf: 'loved', query: grape }));
    } catch {
      /* private mode: the collection opens unfiltered */
    }
    navigate('/');
  };

  return (
    <>
      {structure && (
        <section className="bottle-section">
          <div className="bottle-head">
            <h2>Structure</h2>
            {structure.matches && <span className="bottle-match">Matches your taste</span>}
          </div>
          <div className="bottle-card structure-card">
            <div className="structure-grid">
              <div className="structure-rows">
                <div className="structure-line">{structure.line}</div>
                {structure.rows.map((r) => (
                  <div key={r.label} className="structure-row">
                    <div className="structure-label">
                      <span>{r.label}</span>
                      <strong>{r.value}</strong>
                    </div>
                    <Bar level={r.level} />
                  </div>
                ))}
              </div>
              <div className="structure-glass">
                <GlassArt glass={structure.glass} />
              </div>
            </div>
            {structure.fit && <p className="structure-fit">{structure.fit}</p>}
          </div>
        </section>
      )}

      {grapes && (
        <section className="bottle-section">
          <div className="bottle-head">
            <h2>Grapes</h2>
          </div>
          {grapes.cards.map((g) => (
            <div key={g.name} className="bottle-card grape-card">
              <div className="grape-top">
                <span className="grape-name">{g.name}</span>
                {g.share && <span className="grape-share">{g.share}</span>}
              </div>
              {g.taste && <p className="grape-taste">{g.taste}</p>}
              {g.loved > 0 && (
                <button type="button" className="bottle-link" onClick={() => showLoved(g.name)}>
                  You’ve loved {g.loved} {g.name} {g.loved === 1 ? 'wine' : 'wines'} ›
                </button>
              )}
            </div>
          ))}
          {grapes.more > 0 && <p className="grape-more">+ {grapes.more} more</p>}
        </section>
      )}

      {region && (
        <section className="bottle-section">
          <div className="bottle-head">
            <h2>Region</h2>
          </div>
          <div className="bottle-card region-card">
            <div className="region-title">
              <span className="region-name">
                {region.name}
                {region.area && (
                  <>
                    , <em>{region.area}</em>
                  </>
                )}
              </span>
              {region.country && <span className="region-country">{region.country}</span>}
            </div>
            <dl className="region-rows">
              <dt>Known for</dt>
              <dd>{region.knownFor}</dd>
              <dt>Taste</dt>
              <dd>{region.taste}</dd>
              {region.forYou && (
                <>
                  <dt>For you</dt>
                  <dd className="region-you">{region.forYou}</dd>
                </>
              )}
            </dl>
            {region.more && (
              <button type="button" className="bottle-link muted" onClick={() => setReading(true)}>
                Read more ›
              </button>
            )}
          </div>
          {reading && (
            <Sheet title={region.area ? `${region.name}, ${region.area}` : region.name} onClose={() => setReading(false)}>
              <p className="region-more">{region.more}</p>
            </Sheet>
          )}
        </section>
      )}
    </>
  );
}
