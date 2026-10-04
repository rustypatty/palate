import { ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useLists, useWines } from '../hooks';
import { formatDate } from '../lib/format';
import { getApiKey } from '../lib/labelReader';
import { bottleAsItem, isStale, LIKE_COST, likeSearch, searchLikeThis, storesSearched, withPogoOffers } from '../lib/likeThis';
import { markNotForMe, saveToWant } from '../lib/lists';
import { bottlesLikeThis } from '../lib/recommend';
import { possessive, storeById, type StoreId, type StoreItem } from '../lib/stores';
import { useAdvisor, useAllStoreItems, useBudget, useTaste } from '../lib/usePicks';
import type { StoreOffer, Wine } from '../types';
import { BottlePlaceholder } from './BottleImage';
import { PickCard, ShelfRow } from './Shelf';
import { useToast } from './Toast';

// Searches already tried this session, so a failure doesn't retry (and bill) in a loop.
const tried = new Set<string>();

function listName(w: Wine) {
  return [w.producer, w.name, w.region && `(${w.region})`].filter(Boolean).join(' ');
}

/**
 * Bottles you could buy that are like this one: one search across your stores' websites
 * (saved on the wine, refreshed after a month), plus Pogo's list if you've loaded it.
 */
export function MoreLikeThis({ wine }: { wine: Wine }) {
  const wines = useWines();
  const lists = useLists();
  const taste = useTaste();
  const advisor = useAdvisor();
  const entries = useAllStoreItems();
  const [budget] = useBudget();
  const toast = useToast();
  const running = useSyncExternalStore(likeSearch.subscribe, () => likeSearch.running(wine.id));
  const [error, setError] = useState<string | null>(null);
  const hasKey = Boolean(getApiKey());
  const enjoyed = wine.rating === 'loved' || wine.rating === 'liked';

  const start = () => {
    setError(null);
    tried.add(wine.id);
    const all = wines ?? [];
    searchLikeThis(wine, {
      taste: taste?.summary ?? [],
      loved: all.filter((w) => w.rating === 'loved').map(listName),
      disliked: all.filter((w) => w.rating === 'wouldnt').map(listName),
      skip: [...(lists?.want ?? []), ...(lists?.passed ?? []), ...all].map(listName).slice(0, 40),
    }).then((r) => {
      if (!r.ok) setError(`Couldn’t search the stores: ${r.reason}.`);
    });
  };

  // Wines you enjoyed: search the first time, and again once the results are a month old.
  useEffect(() => {
    if (!enjoyed || !hasKey || !wines || !lists || running || tried.has(wine.id) || !navigator.onLine) return;
    if (isStale(wine)) start();
  }, [wine.id, enjoyed, hasKey, wines, lists, running, wine.likeThis?.at]);

  const cards = useMemo(() => {
    if (!advisor || !lists || !entries) return undefined;
    const pogo = entries.filter((e) => e.storeId === 'pogos').map((e) => e.item as StoreItem);
    const found = withPogoOffers(wine.likeThis?.bottles ?? [], pogo).map(bottleAsItem);
    const skip = new Set(lists.passed.map((w) => w.suggestion?.key));
    const keep = found.filter((item) => {
      if (skip.has(item.key)) return false;
      if (budget !== null && (item.price === null || item.price > budget)) return false;
      const a = advisor.advise({ query: `${item.title} ${item.context ?? ''}`, style: item.style, partial: false });
      return a.verdict.level !== 'skip' && !a.exact.some((w) => w.rating === 'wouldnt');
    });
    // Free extras from Pogo's list, when it's loaded and not already shown.
    const extras = bottlesLikeThis(wine, entries.filter((e) => e.storeId === 'pogos'), advisor, lists.passed, 6, budget).filter(
      (l) => !keep.some((k) => k.offers.some((o) => o.url === l.item.url)),
    );
    return [
      ...keep.map((item) => ({ item, offers: item.offers as StoreOffer[], reason: wine.likeThis!.bottles.find((b) => b.key === item.key)?.reason ?? '' })),
      ...extras.map((l) => ({ item: l.item as StoreItem, offers: [{ storeId: 'pogos', url: l.item.url, price: l.item.price }], reason: l.reason })),
    ].slice(0, 12);
  }, [wine, advisor, lists, entries, budget]);

  const saved = useMemo(() => new Set((lists?.want ?? []).map((w) => w.suggestion?.key).filter(Boolean)), [lists]);
  if (!cards) return null;

  const stores = storesSearched().join(', ').replace(/, ([^,]*)$/, ' and $1');
  const found = wine.likeThis;
  const sub = running
    ? `Searching ${stores} — about a minute`
    : found
      ? `Found ${formatDate(new Date(found.at).toISOString().slice(0, 10))}${budget ? ` · under $${budget}` : ''}`
      : `At ${stores}`;

  const action = running ? null : hasKey ? (
    <button type="button" className="shelf-link" style={{ background: 'none', border: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={start}>
      <RefreshCw size={13} /> {found ? 'New search' : 'Find bottles'} · {LIKE_COST}
    </button>
  ) : (
    <Link to="/profile" state={{ focusKey: Date.now() }} className="shelf-link">
      Add key
    </Link>
  );

  return (
    // min-width 0: inside the page's grid, a scrolling row must not widen the page.
    <div style={{ minWidth: 0 }}>
      <ShelfRow title="Bottles like this to buy" sub={sub} action={action}>
        {running && cards.length === 0
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="mini-card skeleton" aria-hidden="true">
                <div className="tile">
                  <BottlePlaceholder />
                </div>
                <div className="mini-t">&nbsp;</div>
              </div>
            ))
          : cards.map(({ item, offers, reason }) => {
              const store = storeById(((offers.find((o) => o.storeId === 'totalwine') ?? offers[0])?.storeId ?? 'totalwine') as StoreId);
              return (
                <PickCard
                  key={item.key}
                  pick={{ item, reason }}
                  offers={offers}
                  saved={saved.has(item.key)}
                  onWant={async () => (await saveToWant(item, store, reason), toast('Saved to Want to try'))}
                  onPass={async () => (await markNotForMe(item, store, reason), toast('Hidden — it won’t be suggested again'))}
                />
              );
            })}
      </ShelfRow>
      {!running && cards.length === 0 && (
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          {!hasKey
            ? `Add your Anthropic API key in My palate to find bottles like this at ${stores}.`
            : found
              ? 'No confirmed bottles at your stores this time.'
              : enjoyed
                ? 'Looking for bottles like this at your stores…'
                : `Tap “Find bottles” to search ${stores} for bottles like this.`}
        </p>
      )}
      {!running && found && found.tips.length > 0 && (
        <div className="small muted" style={{ marginTop: 8 }}>
          <strong style={{ color: 'var(--ink-2)' }}>Also look for</strong>
          <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
            {found.tips.slice(0, 4).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p className="small" role="alert" style={{ color: 'var(--danger)', margin: '6px 0 0' }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Where a suggested wine came from, and what to do with it. */
export function SuggestionNote({ wine }: { wine: Wine }) {
  const s = wine.suggestion;
  if (!s) return null;
  return (
    <div className="suggestion-note">
      <div className="small">
        <strong>{wine.list === 'want' ? 'On your Want to try list' : `Suggested at ${s.source}`}</strong>
        {wine.list === 'want' && <span className="muted"> · suggested at {s.source}</span>}
      </div>
      {s.reason && <div className="small">{s.reason}</div>}
      {s.url && (
        <a href={s.url} target="_blank" rel="noreferrer" className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ExternalLink size={13} /> See it on {possessive(s.source)} website
        </a>
      )}
    </div>
  );
}
