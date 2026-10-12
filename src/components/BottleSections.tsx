import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWines } from '../hooks';
import { grapeCard, regionCard, structureOf } from '../lib/bottleSections';
import { cachedFacts, catalogFacts, type CatalogFacts } from '../lib/catalogFacts';
import { DEFAULT_FILTERS } from '../lib/filters';
import { buildTaste } from '../lib/taste';
import type { Wine } from '../types';
import { GlassArt } from './GlassArt';
import { useProfile } from './ProfileImport';
import RegionMap from './RegionMap';
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
 * Structure, Grapes and Region, after your notes on a wine page. Built from the wine, Palate's
 * catalog, Palate's own grape and region guides and your ratings (no Claude call). A section with
 * nothing reliable to say is left out.
 */
export function BottleSections({ wine }: { wine: Wine }) {
  const wines = useWines();
  const profile = useProfile();
  const navigate = useNavigate();
  const [reading, setReading] = useState(false);
  // The catalog's grapes and sub-region (free; kept on this device once asked).
  const [facts, setFacts] = useState<CatalogFacts | null>(() => cachedFacts(wine.producer, wine.name));
  useEffect(() => {
    setFacts(cachedFacts(wine.producer, wine.name));
    if (!navigator.onLine || cachedFacts(wine.producer, wine.name)) return;
    let live = true;
    void catalogFacts(wine.producer, wine.name)
      .then((f) => live && setFacts(f))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [wine.producer, wine.name]);
  const all = wines ?? [];
  const taste = useMemo(() => (wines ? buildTaste(wines) : null), [wines]);
  const structure = useMemo(() => structureOf(wine, profile, facts), [wine, profile, facts]);
  const grapes = useMemo(() => grapeCard(wine, all, facts), [wine, wines, facts]);
  const region = useMemo(() => regionCard(wine, all, taste, facts), [wine, wines, taste, facts]);

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
          <div className="bottle-card grape-card">
            <div className="grape-top">
              <span className="grape-name">
                {grapes.names.join(', ')}
                {grapes.more > 0 && <span className="grape-more"> + {grapes.more} more</span>}
              </span>
              {grapes.share && <span className="grape-share">{grapes.share}</span>}
            </div>
            {grapes.taste && <p className="grape-taste">{grapes.taste}</p>}
            {grapes.loved && (
              <button type="button" className="bottle-link" onClick={() => showLoved(grapes.loved!.grape)}>
                You’ve loved {grapes.loved.n} {grapes.loved.grape} {grapes.loved.n === 1 ? 'wine' : 'wines'} ›
              </button>
            )}
          </div>
        </section>
      )}

      {region && (
        <section className="bottle-section">
          <div className="bottle-head">
            <h2>Region</h2>
          </div>
          <div className="bottle-card region-card">
            {region.place && <RegionMap place={region.place} name={region.name} />}
            <div className="region-body">
            <div className="region-title">
              <span className="region-name">
                {region.name}
                {region.area && (
                  <>
                    , <em>{region.area}</em>
                  </>
                )}
              </span>
              {region.sub && <span className="region-country">{region.sub}</span>}
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
