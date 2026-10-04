import { Plus, ScanLine, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BottlePlaceholder } from '../components/BottleImage';
import { FilterSheet, SORTS } from '../components/FilterSheet';
import { MiniWineCard, ShelfRow } from '../components/Shelf';
import { RatePrompt, StorePicksRow } from '../components/StorePicks';
import { Wordmark } from '../components/Layout';
import { WineCard } from '../components/WineCard';
import { useDebounced, useLists, useWines } from '../hooks';
import { PRICE_BANDS, STYLE_LABEL } from '../lib/constants';
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, type Filters, type Shelf } from '../lib/filters';
import { buyAgain, fromCellar } from '../lib/recommend';
import { useTaste } from '../lib/usePicks';
import type { Wine } from '../types';

const SHELVES: { value: Shelf; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'loved', label: 'Loved it' },
  { value: 'liked', label: 'Liked it' },
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

/** Compact suggestion rows above the collection, shown only while browsing: at most two. */
function HomeRows({ wines }: { wines: Wine[] }) {
  const taste = useTaste();
  const lists = useLists();
  // One "shortlist" row: saved to try, loved-but-none-at-home, and forgotten bottles at home.
  const shortlist = useMemo(() => {
    const seen = new Set<string>();
    const out: { wine: Wine; note: string }[] = [];
    const add = (w: Wine, note: string) => !seen.has(w.id) && (seen.add(w.id), out.push({ wine: w, note }));
    (lists?.want ?? []).slice(0, 8).forEach((w) => add(w, 'Want to try'));
    buyAgain(wines).slice(0, 8).forEach((w) => add(w, 'Buy again'));
    fromCellar(wines).slice(0, 6).forEach((w) => add(w, since(w)));
    return out;
  }, [wines, lists]);
  const parts = [lists?.want.length ? 'Want to try' : '', buyAgain(wines).length ? 'Buy again' : '', fromCellar(wines).length ? 'From your cellar' : ''].filter(Boolean);
  return (
    <div className="home-rows">
      {taste && !taste.enough ? <RatePrompt rated={taste.rated} /> : <StorePicksRow />}
      {shortlist.length > 0 && (
        <ShelfRow
          title="Your shortlist"
          sub={parts.join(' · ')}
          action={
            lists && lists.want.length > 0 ? (
              <Link to="/want" className="shelf-link">
                Want to try ({lists.want.length})
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

export function CollectionPage() {
  const wines = useWines();
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [showFilters, setShowFilters] = useState(false);
  const query = useDebounced(filters.query, 120);
  const searchRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const focusToken = (location.state as { focusSearch?: number } | null)?.focusSearch;

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* private mode: filters just won't persist */
    }
  }, [filters]);

  useEffect(() => {
    if (focusToken) {
      window.scrollTo({ top: 0 });
      searchRef.current?.focus();
    }
  }, [focusToken]);

  const results = useMemo(() => (wines ? applyFilters(wines, { ...filters, query }) : []), [wines, filters, query]);
  const shelfCounts = useMemo(() => {
    const base = { ...filters, query, shelf: 'all' as Shelf };
    return Object.fromEntries(SHELVES.map((s) => [s.value, wines ? applyFilters(wines, { ...base, shelf: s.value }).length : 0]));
  }, [wines, filters, query]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const nFilters = activeFilterCount(filters);

  if (wines === undefined) return null;

  if (wines.length === 0) {
    return (
      <>
        <div className="page-head mobile-only">
          <Wordmark />
        </div>
        <div className="empty">
          <div className="art">
            <BottlePlaceholder size={72} />
          </div>
          <h2>Start your wine list</h2>
          <p>Snap a label or add a bottle you’ve enjoyed. Palate remembers what you drink, what you thought, and what you own.</p>
          <div className="actions">
            <Link to="/add" className="btn btn-primary">
              <Plus size={18} /> Add your first wine
            </Link>
            <Link to="/profile" className="btn btn-secondary">
              Restore a backup
            </Link>
          </div>
        </div>
      </>
    );
  }

  const sortLabel = SORTS.find((s) => s.value === filters.sort)?.label;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="mobile-only">
            <Wordmark />
          </span>
          <h1 className="desktop-only">My wines</h1>
          <p className="sub">
            {wines.length} {wines.length === 1 ? 'wine' : 'wines'} ·{' '}
            {wines.reduce((n, w) => n + w.owned, 0)} bottles in your cellar
          </p>
        </div>
        <Link to="/store" className="icon-btn mobile-only" aria-label="In-store check">
          <ScanLine size={20} />
        </Link>
      </div>

      <div className="search-row">
        <label className="search">
          <Search size={20} />
          <span className="sr-only">Search your wines</span>
          <input
            ref={searchRef}
            type="search"
            enterKeyHint="search"
            placeholder="Search producer, grape, region…"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            autoComplete="off"
          />
          {filters.query && (
            <button type="button" className="clear" onClick={() => set({ query: '' })} aria-label="Clear search">
              <X size={18} />
            </button>
          )}
        </label>
        <button type="button" className="icon-btn" style={{ width: 48, height: 48 }} onClick={() => setShowFilters(true)} aria-label="Filters">
          <SlidersHorizontal size={20} />
          {nFilters > 0 && <span className="badge-dot">{nFilters}</span>}
        </button>
      </div>

      {!filters.query && nFilters === 0 && filters.shelf === 'all' && <HomeRows wines={wines} />}

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
          {results.length} {results.length === 1 ? 'result' : 'results'}
        </span>
        <label>
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

      {results.length === 0 ? (
        <div className="empty">
          <h2>No wines match</h2>
          <p>Try a different search or clear your filters.</p>
          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}>
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

      {showFilters && <FilterSheet wines={wines} filters={filters} onApply={setFilters} onClose={() => setShowFilters(false)} />}
    </>
  );
}
