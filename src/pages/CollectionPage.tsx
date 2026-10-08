import { Bookmark, Plus, ScanLine, Search, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { useToast } from '../components/Toast';
import { BottleImage, BottlePlaceholder } from '../components/BottleImage';
import { FilterSheet, SORTS } from '../components/FilterSheet';
import { FillerTile, MiniWineCard, ShelfRow } from '../components/Shelf';
import { RatePrompt, StorePicksRow } from '../components/StorePicks';
import { TonightCard } from '../components/TonightCard';
import { useWantCount, Wordmark } from '../components/Layout';
import { WineCard } from '../components/WineCard';
import { useDebounced, useMediaQuery, usePhotoUrl, useWines } from '../hooks';
import { useBottleBox } from '../components/useTrimmedPhoto';
import { PRICE_BANDS, STYLE_LABEL } from '../lib/constants';
import { shownPhoto } from '../lib/image';
import { lookupBarcode } from '../lib/imageSearch';
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, type Filters, type Shelf } from '../lib/filters';
import { buyAgain } from '../lib/recommend';
import { useTaste } from '../lib/usePicks';
import type { Wine } from '../types';
import type { CheckPrefill } from './InStorePage';
import type { AddPrefill } from './WineFormPage';

const SHELVES: { value: Shelf; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'loved', label: 'Loved' },
  { value: 'liked', label: 'Liked' },
  { value: 'wouldnt', label: 'Wouldn’t buy again' },
  { value: 'owned', label: 'In my cellar' },
  { value: 'untasted', label: 'Not tasted yet' },
];

const STORAGE_KEY = 'palate.filters';

function loadFilters(): Filters {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** "Clos Saint Michel (Mousset)" → "Clos Saint Michel" for captions. */
const shortProducer = (w: Wine) => (w.producer || w.name).replace(/\s*\(.*?\)\s*/g, ' ').trim();

/** The golden-hour welcome: how many bottles you'd pour again, and the latest of them standing in the light. */
function Hero({ wines }: { wines: Wine[] }) {
  const loved = useMemo(() => wines.filter((w) => w.rating === 'loved').sort((a, b) => b.updatedAt - a.updatedAt), [wines]);
  const withPhoto = loved.filter((w) => shownPhoto(w.photo));
  const owned = wines.reduce((n, w) => n + w.owned, 0);
  const latest = withPhoto[0] ?? loved[0];
  const row = withPhoto.slice(0, 4);
  // The caption names the bottles in the picture (or the latest loved ones if none have photos).
  const captioned = row.length ? row : loved.slice(0, 4);
  const n = loved.length;

  // Phone: the loved bottles take turns in the light, each rising into place.
  const slides = withPhoto.slice(0, 8);
  const [slide, setSlide] = useState(0);
  const [leavingIdx, setLeavingIdx] = useState<number | null>(null);
  const touchX = useRef(0);
  const go = (i: number) => {
    if (slides.length < 2) return;
    const next = (i + slides.length) % slides.length;
    if (next === slide) return;
    setLeavingIdx(slide);
    setSlide(next);
  };
  useEffect(() => {
    if (slides.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setTimeout(() => go(slide + 1), 5000);
    return () => window.clearTimeout(t);
  }, [slide, slides.length]);
  useEffect(() => {
    if (leavingIdx === null) return;
    const t = window.setTimeout(() => setLeavingIdx(null), 800);
    return () => window.clearTimeout(t);
  }, [leavingIdx, slide]);
  const shown = slides[Math.min(slide, slides.length - 1)] ?? latest;
  const leaving = leavingIdx !== null ? slides[leavingIdx] : undefined;

  return (
    <section className="hero-block" aria-label="Welcome">
      <div className="hero-text">
        <div className="eyebrow">{greeting()}</div>
        <h1 className="headline">
          {n === 0 ? (
            <>
              Bottles worth <em>remembering.</em>
            </>
          ) : n === 1 ? (
            <>
              A bottle you’d pour <em>again.</em>
            </>
          ) : (
            <>
              The bottles you’d pour <em>again.</em>
            </>
          )}
        </h1>
        <p className="hero-sub">
          {[n ? `${n} loved` : '', `${wines.length} ${wines.length === 1 ? 'wine' : 'wines'}`, `${owned} in your cellar`].filter(Boolean).join(' · ')}
        </p>
        {shown && (
          <div className="hero-caption mobile-only" aria-live="polite">
            <div className="eyebrow">{slide === 0 ? 'Last loved' : 'Also loved'}</div>
            <div className="hero-caption-name" key={shown.id}>
              <span className="one-line">{shortProducer(shown)}</span>
              {shown.name && shown.producer && <span className="one-line">{shown.name}</span>}
            </div>
          </div>
        )}
        {captioned.length > 0 && (
          <div className="hero-caption desktop-only">
            <div className="eyebrow">{captioned.length === 1 ? 'Your latest love' : `Your loved ${NUMBER_WORDS[captioned.length].toLowerCase()}`}</div>
            <div className="hero-caption-name one-line">{captioned.map((w) => w.name || w.region || shortProducer(w)).join(' · ')}</div>
          </div>
        )}
      </div>
      {shown?.photo && (
        <div
          className="hero-carousel mobile-only"
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 40) go(slide + (dx < 0 ? 1 : -1));
          }}
        >
          {leaving?.photo && (
            <div className="hero-bottle leaving" aria-hidden="true">
              <BottleImage photo={leaving.photo} alt="" eager />
            </div>
          )}
          <Link key={shown.id} to={`/wine/${shown.id}`} className="hero-bottle entering lift" aria-label={`Open ${shortProducer(shown)}`}>
            <BottleImage photo={shown.photo} alt="" eager />
          </Link>
          {slides.length > 1 && (
            <div className="hero-dots" role="group" aria-label="Loved bottles">
              {slides.map((w, i) => (
                <button key={w.id} type="button" aria-pressed={i === slide} aria-label={`Show ${shortProducer(w)}`} onClick={() => go(i)}>
                  <i />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {row.length > 0 && <HeroBottles wines={row} />}
    </section>
  );
}

const HERO_BOTTLE = 420;
const HERO_GAP = 48;

/**
 * Desktop: the loved bottles stand side by side at the same visual height. Each photo's
 * bottle outline is measured, so a photo with wide margins doesn't make a small bottle.
 */
function HeroBottles({ wines }: { wines: Wine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Same height for every bottle; smaller for all of them only if the row wouldn't fit.
  const sum = wines.reduce((n, w) => n + (ratios[w.id] ?? 0.3), 0);
  const fit = width ? (width - HERO_GAP * (wines.length - 1)) / sum : HERO_BOTTLE;
  const height = Math.max(160, Math.min(HERO_BOTTLE, fit));
  const onRatio = useCallback((id: string, r: number) => setRatios((cur) => (cur[id] === r ? cur : { ...cur, [id]: r })), []);
  return (
    <div className="hero-bottles desktop-only" ref={ref}>
      {wines.map((w) => (
        <HeroBottle key={w.id} wine={w} height={height} onRatio={onRatio} />
      ))}
    </div>
  );
}

function HeroBottle({ wine, height, onRatio }: { wine: Wine; height: number; onRatio: (id: string, r: number) => void }) {
  const url = usePhotoUrl(shownPhoto(wine.photo));
  const box = useBottleBox(url);
  const ratio = box ? ((box.right - box.left) / (box.bottom - box.top)) * box.aspect : 0.3;
  useEffect(() => {
    if (box !== undefined) onRatio(wine.id, ratio);
  }, [box, ratio, wine.id, onRatio]);
  const label = `Open ${shortProducer(wine)}`;
  if (!url || box === undefined) return <span className="hero-bottle-m" style={{ width: height * ratio, height }} aria-hidden="true" />;
  if (box === null) {
    // Couldn't measure (e.g. the photo's site doesn't allow it): show it whole at the same height.
    return (
      <Link to={`/wine/${wine.id}`} className="hero-bottle-m lift" style={{ width: height * 0.36, height }} aria-label={label}>
        <img className="bottle contain" src={url} alt="" />
      </Link>
    );
  }
  const imgH = height / (box.bottom - box.top);
  const imgW = imgH * box.aspect;
  return (
    <Link to={`/wine/${wine.id}`} className="hero-bottle-m lift" style={{ width: height * ratio, height }} aria-label={label}>
      <img className="bottle" src={url} alt="" style={{
          width: imgW,
          height: imgH,
          left: -box.left * imgW,
          top: -box.top * imgH,
          // Only the bottle shows; the photo's margins can't tint the neighbours.
          clipPath: `inset(${box.top * 100}% ${(1 - box.right) * 100}% ${(1 - box.bottom) * 100}% ${box.left * 100}%)`,
        }} />
    </Link>
  );
}

/** Suggestion rows above the collection, shown only while browsing. */
function HomeRows({ wines, onShow }: { wines: Wine[]; onShow: (shelf: Shelf) => void }) {
  const taste = useTaste();
  const wide = useMediaQuery('(min-width: 1024px)');
  // Loved, and none left at home: the ones to buy again.
  const shortlist = useMemo(() => buyAgain(wines), [wines]);
  const cellar = useMemo(() => wines.filter((w) => w.owned > 0).sort((a, b) => b.updatedAt - a.updatedAt), [wines]);
  const seeAll = (shelf: Shelf) => (
    <button type="button" className="text-link" onClick={() => onShow(shelf)}>
      See all
    </button>
  );
  const shortRow = shortlist.length > 0 && (
    <ShelfRow
      title="Your shortlist"
      sub="Loved it — buy again"
      grid={{ seeAll: seeAll('loved'), filler: <FillerTile to="/add" label="Add a loved wine" state={{ draft: { rating: 'loved' } } satisfies AddPrefill} /> }}
    >
      {shortlist.slice(0, wide ? undefined : 12).map((wine) => (
        <MiniWineCard key={wine.id} wine={wine} />
      ))}
    </ShelfRow>
  );
  const cellarRow = cellar.length > 0 && (
    <ShelfRow
      title="In your cellar"
      sub={(() => {
        const n = cellar.reduce((t, w) => t + w.owned, 0);
        return `${n} ${n === 1 ? 'bottle' : 'bottles'} on hand`;
      })()}
      grid={{ seeAll: seeAll('owned'), filler: <FillerTile to="/add" label="Add a bottle you own" state={{ draft: { owned: 1 } } satisfies AddPrefill} /> }}
    >
      {cellar.map((wine) => (
        <MiniWineCard key={wine.id} wine={wine} note={`${wine.owned} in cellar`} />
      ))}
    </ShelfRow>
  );
  // Two short rows sit side by side on a wide screen.
  const pair = wide && shortlist.length > 0 && cellar.length > 0 && shortlist.length <= 4 && cellar.length <= 4;
  return (
    <div className="home-rows">
      {cellar.length > 0 && <TonightCard />}
      {taste && !taste.enough ? <RatePrompt rated={taste.rated} /> : <StorePicksRow />}
      {pair ? (
        <div className="shelf-pair">
          {shortRow}
          {cellarRow}
        </div>
      ) : (
        <>
          {shortRow}
          {cellarRow}
        </>
      )}
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  return (
    <label className="search">
      <Search size={20} strokeWidth={1.7} />
      <span className="sr-only">Search your wines</span>
      <input
        type="search"
        enterKeyHint="search"
        placeholder="Producer, grape, region"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      {value && (
        <button type="button" className="clear" onClick={() => onChange('')} aria-label="Clear search">
          <X size={18} />
        </button>
      )}
    </label>
  );
}

export function CollectionPage() {
  const wines = useWines();
  const wantCount = useWantCount();
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [showFilters, setShowFilters] = useState(false);
  const query = useDebounced(filters.query, 120);
  const [scanning, setScanning] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  // Scanned on the home screen: your own bottle opens straight away; anything else gets the in-store check.
  const onScanned = async (code: string) => {
    setScanning(false);
    const mine = wines?.find((w) => w.barcode === code);
    if (mine) {
      navigate(`/wine/${mine.id}`);
      return;
    }
    toast('Looking up the barcode…');
    let text = '';
    try {
      const found = await lookupBarcode(code);
      text = found ? [found.brand, found.title].filter(Boolean).join(' ') : '';
    } catch {
      /* offline: check by typing instead */
    }
    if (!text) toast('Barcode not recognised. Type the name from the label.');
    navigate('/store', { state: { check: text, barcode: code } satisfies CheckPrefill });
  };

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* private mode: filters just won't persist */
    }
  }, [filters]);

  const results = useMemo(() => (wines ? applyFilters(wines, { ...filters, query }) : []), [wines, filters, query]);
  const shelfCounts = useMemo(() => {
    const base = { ...filters, query, shelf: 'all' as Shelf };
    return Object.fromEntries(SHELVES.map((s) => [s.value, wines ? applyFilters(wines, { ...base, shelf: s.value }).length : 0]));
  }, [wines, filters, query]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const nFilters = activeFilterCount(filters);

  if (wines === undefined) return null;

  const header = (
    <div className="home-head mobile-only">
      <Wordmark />
      <div className="head-actions">
        <Link to="/want" className="icon-btn" aria-label={`Want to try (${wantCount})`}>
          <Bookmark size={20} strokeWidth={1.6} />
          {wantCount > 0 && (
            <span key={wantCount} className="badge-dot pop">
              {wantCount}
            </span>
          )}
        </Link>
        <button type="button" className="icon-btn" onClick={() => setScanning(true)} aria-label="Scan a bottle’s barcode">
          <ScanLine size={20} strokeWidth={1.6} />
        </button>
      </div>
    </div>
  );

  const scanner = scanning && <BarcodeScanner onDetected={onScanned} onClose={() => setScanning(false)} />;

  if (wines.length === 0) {
    return (
      <>
        {header}
        {scanner}
        <div className="empty">
          <div className="art">
            <BottlePlaceholder />
          </div>
          <h2>
            Start your <em>wine list.</em>
          </h2>
          <p>Snap a label or add a bottle you’ve enjoyed. Palate remembers what you drink, what you thought, and what you own.</p>
          <div className="actions">
            <Link to="/add" className="btn btn-wine">
              <Plus size={18} /> Add your first wine
            </Link>
            <Link to="/profile" className="btn btn-tone">
              Restore a backup
            </Link>
          </div>
        </div>
      </>
    );
  }

  const sortLabel = SORTS.find((s) => s.value === filters.sort)?.label;
  const filterButton = (
    <button type="button" className="icon-btn lg" onClick={() => setShowFilters(true)} aria-label="Filters">
      <SlidersHorizontal size={20} strokeWidth={1.7} />
      {nFilters > 0 && <span className="badge-dot">{nFilters}</span>}
    </button>
  );
  const browsing = !filters.query && nFilters === 0 && filters.shelf === 'all';

  return (
    <>
      {header}
      {scanner}
      <Hero wines={wines} />

      <div className="search-row home-search mobile-only">
        <SearchBox value={filters.query} onChange={(q) => set({ query: q })} />
        {filterButton}
      </div>

      {browsing && (
        <HomeRows
          wines={wines}
          onShow={(shelf) => {
            set({ shelf });
            window.requestAnimationFrame(() => document.querySelector('.collection')?.scrollIntoView({ behavior: 'smooth' }));
          }}
        />
      )}

      <section className="collection" aria-label="Your collection">
        <div className="collection-head">
          <h2 className="title-lg">Your collection</h2>
          <div className="search-row desktop-only">
            <SearchBox value={filters.query} onChange={(q) => set({ query: q })} />
            {filterButton}
          </div>
        </div>

        <div className="collection-filters">
          <div className="chips" role="group" aria-label="Show">
            {SHELVES.map((s) => (
              <button key={s.value} type="button" className="chip" aria-pressed={filters.shelf === s.value} onClick={() => set({ shelf: s.value })}>
                {s.label}
                <span className="count">{shelfCounts[s.value]}</span>
              </button>
            ))}
          </div>

          {nFilters > 0 && (
            <div className="active-filters">
              {filters.countries.map((c) => (
                <button key={c} type="button" className="chip" onClick={() => set({ countries: filters.countries.filter((x) => x !== c) })}>
                  {c} <X size={14} />
                </button>
              ))}
              {filters.styles.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => set({ styles: filters.styles.filter((x) => x !== s) })}>
                  {STYLE_LABEL[s]} <X size={14} />
                </button>
              ))}
              {filters.priceBands.map((b) => (
                <button key={b} type="button" className="chip" onClick={() => set({ priceBands: filters.priceBands.filter((x) => x !== b) })}>
                  {PRICE_BANDS.find((p) => p.id === b)?.label} <X size={14} />
                </button>
              ))}
            </div>
          )}

          <div className="toolbar">
            <span>
              {results.length} {results.length === 1 ? 'wine' : 'wines'}
            </span>
            <label className="sort">
              <span className="sr-only">Sort by</span>
              <select className="select-inline" value={filters.sort} onChange={(e) => set({ sort: e.target.value as Filters['sort'] })} aria-label={`Sort: ${sortLabel}`}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {results.length === 0 ? (
          <div className="empty">
            <h2>
              No wines <em>match.</em>
            </h2>
            <p>Try a different search or clear your filters.</p>
            <div className="actions">
              <button type="button" className="btn btn-tone" onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}>
                Clear search & filters
              </button>
            </div>
          </div>
        ) : (
          <div className="grid">
            {results.map((w, i) => (
              <WineCard key={w.id} wine={w} eager={i < 8} />
            ))}
          </div>
        )}
      </section>

      {showFilters && <FilterSheet wines={wines} filters={filters} onApply={setFilters} onClose={() => setShowFilters(false)} />}
    </>
  );
}
