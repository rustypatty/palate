import { Bookmark, Plus, ScanLine, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BottleImage, BottlePlaceholder } from '../components/BottleImage';
import { FilterSheet, SORTS } from '../components/FilterSheet';
import { MiniWineCard, ShelfRow } from '../components/Shelf';
import { RatePrompt, StorePicksRow } from '../components/StorePicks';
import { useWantCount, Wordmark } from '../components/Layout';
import { WineCard } from '../components/WineCard';
import { useDebounced, useLists, useWines } from '../hooks';
import { PRICE_BANDS, STYLE_LABEL } from '../lib/constants';
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, type Filters, type Shelf } from '../lib/filters';
import { buyAgain, fromCellar } from '../lib/recommend';
import { useTaste } from '../lib/usePicks';
import type { Wine } from '../types';

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

function since(w: Wine): string {
  const t = w.tastedOn ? Date.parse(w.tastedOn) : w.createdAt;
  const d = new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return w.tastedOn ? `Cellar · tasted ${d}` : `Cellar · since ${d}`;
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
  const withPhoto = loved.filter((w) => w.photo);
  const owned = wines.reduce((n, w) => n + w.owned, 0);
  const latest = withPhoto[0] ?? loved[0];
  const row = withPhoto.slice(0, 4);
  // The most recent one stands in the middle, a little taller.
  const ordered = row.length > 1 ? [row[1], row[0], ...row.slice(2)] : row;
  const n = loved.length;
  return (
    <section className="hero-block" aria-label="Welcome">
      <div className="hero-text">
        <div className="eyebrow">{greeting()}</div>
        <h1 className="headline">
          {n === 0 ? (
            <>
              Bottles worth <em>remembering.</em>
            </>
          ) : (
            <>
              {n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : n} {n === 1 ? 'bottle' : 'bottles'} you’d pour <em>again.</em>
            </>
          )}
        </h1>
        <p className="hero-sub">
          {wines.length} {wines.length === 1 ? 'wine' : 'wines'} · {owned} in your cellar
        </p>
        {latest && (
          <div className="hero-caption mobile-only">
            <div className="eyebrow">Last loved</div>
            <div className="hero-caption-name">
              {shortProducer(latest)}
              {latest.name && latest.producer && <br />}
              {latest.producer ? latest.name : ''}
            </div>
          </div>
        )}
        {row.length > 0 && (
          <div className="hero-caption desktop-only">
            <div className="eyebrow">{row.length === 1 ? 'Your latest love' : `Your loved ${NUMBER_WORDS[row.length]?.toLowerCase() ?? row.length}`}</div>
            <div className="hero-caption-name">{row.map(shortProducer).join(' · ')}</div>
          </div>
        )}
      </div>
      {latest?.photo && (
        <Link to={`/wine/${latest.id}`} className="hero-bottle mobile-only lift" aria-label={`Open ${shortProducer(latest)}`}>
          <BottleImage photo={latest.photo} alt="" eager />
        </Link>
      )}
      {ordered.length > 0 && (
        <div className="hero-bottles desktop-only">
          {ordered.map((w) => (
            <Link key={w.id} to={`/wine/${w.id}`} className={`hero-bottle lift${w === row[0] ? ' main' : ''}`} aria-label={`Open ${shortProducer(w)}`}>
              <BottleImage photo={w.photo} alt="" eager />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** Suggestion rows above the collection, shown only while browsing. */
function HomeRows({ wines }: { wines: Wine[] }) {
  const taste = useTaste();
  const lists = useLists();
  // One "shortlist" row: loved but none at home, saved to try, and forgotten bottles at home.
  const shortlist = useMemo(() => {
    const seen = new Set<string>();
    const out: { wine: Wine; note?: string }[] = [];
    const add = (w: Wine, note?: string) => !seen.has(w.id) && (seen.add(w.id), out.push({ wine: w, note }));
    buyAgain(wines).slice(0, 8).forEach((w) => add(w));
    (lists?.want ?? []).slice(0, 8).forEach((w) => add(w, 'Want to try'));
    fromCellar(wines).slice(0, 6).forEach((w) => add(w, since(w)));
    return out;
  }, [wines, lists]);
  const sub = buyAgain(wines).length ? 'Loved it — buy again' : lists?.want.length ? 'Saved to try' : 'Waiting in your cellar';
  return (
    <div className="home-rows">
      {taste && !taste.enough ? <RatePrompt rated={taste.rated} /> : <StorePicksRow />}
      {shortlist.length > 0 && (
        <ShelfRow
          title="Your shortlist"
          sub={sub}
          action={
            lists && lists.want.length > 0 ? (
              <Link to="/want" className="text-link">
                Want to try · {lists.want.length}
              </Link>
            ) : undefined
          }
        >
          {shortlist.map(({ wine, note }) => (
            <MiniWineCard key={wine.id} wine={wine} note={note} />
          ))}
        </ShelfRow>
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
        <Link to="/store" className="icon-btn" aria-label="Check a bottle in the store">
          <ScanLine size={20} strokeWidth={1.6} />
        </Link>
      </div>
    </div>
  );

  if (wines.length === 0) {
    return (
      <>
        {header}
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
      <Hero wines={wines} />

      <div className="search-row home-search mobile-only">
        <SearchBox value={filters.query} onChange={(q) => set({ query: q })} />
        {filterButton}
      </div>

      {browsing && <HomeRows wines={wines} />}

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
