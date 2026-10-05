import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useLists, useWines } from '../hooks';
import { formatDate } from '../lib/format';
import { getApiKey } from '../lib/labelReader';
import { bottleAsItem, checkedSummary, isStale, LIKE_COST, likeSearch, searchLikeThis, storesSearched, withPogoOffers } from '../lib/likeThis';
import { markNotForMe, saveToWant } from '../lib/lists';
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
  const failed = useSyncExternalStore(likeSearch.subscribe, () => likeSearch.error(wine.id));
  const hasKey = Boolean(getApiKey());
  const enjoyed = wine.rating === 'loved' || wine.rating === 'liked';

  const start = () => {
    tried.add(wine.id);
    const all = wines ?? [];
    searchLikeThis(wine, {
      taste: taste?.summary ?? [],
      loved: all.filter((w) => w.rating === 'loved').map(listName),
      disliked: all.filter((w) => w.rating === 'wouldnt').map(listName),
      skip: [...(lists?.want ?? []), ...(lists?.passed ?? []), ...all].map(listName).slice(0, 40),
    });
  };

  // Wines you enjoyed: search the first time, and again once the results are a month old.
  useEffect(() => {
    if (!enjoyed || !hasKey || !wines || !lists || running || tried.has(wine.id) || !navigator.onLine) return;
    if (isStale(wine)) start();
  }, [wine.id, enjoyed, hasKey, wines, lists, running, wine.likeThis?.at]);

  const cards = useMemo(() => {
    if (!advisor || !lists || !entries) return undefined;
    // Only bottles the search found at your stores. Pogo's, if loaded, just adds its price/photo.
    const pogo = entries.filter((e) => e.storeId === 'pogos').map((e) => e.item as StoreItem);
    const found = withPogoOffers(wine.likeThis?.bottles ?? [], pogo).map(bottleAsItem);
    const skip = new Set(lists.passed.map((w) => w.suggestion?.key));
    return found
      .filter((item) => {
        if (skip.has(item.key)) return false;
        if (budget !== null && (item.price === null || item.price > budget)) return false;
        const a = advisor.advise({ query: `${item.title} ${item.context ?? ''}`, style: item.style, partial: false });
        return a.verdict.level !== 'skip' && !a.exact.some((w) => w.rating === 'wouldnt');
      })
      .map((item) => {
        const bottle = wine.likeThis!.bottles.find((b) => b.key === item.key);
        return { item, offers: item.offers as StoreOffer[], reason: bottle?.reason ?? '', bottle };
      })
      .slice(0, 12);
  }, [wine, advisor, lists, entries, budget]);

  const saved = useMemo(() => new Set((lists?.want ?? []).map((w) => w.suggestion?.key).filter(Boolean)), [lists]);
  if (!cards) return null;

  const stores = storesSearched().join(', ').replace(/, ([^,]*)$/, ' and $1');
  const found = wine.likeThis;
  const when = found ? formatDate(new Date(found.at).toISOString().slice(0, 10)) : '';
  const summary = found?.checked ? checkedSummary(found.checked) : '';
  const sub = running
    ? `Searching ${stores} — about a minute`
    : found
      ? `Found ${when}${summary ? ` · ${summary}` : ''}${budget ? ` · under $${budget}` : ''}`
      : `At ${stores}`;

  const action = running ? null : hasKey ? (
    <button type="button" className="btn btn-tone btn-sm" onClick={start}>
      <RefreshCw size={14} strokeWidth={1.8} /> {found ? 'New search' : 'Find bottles'} · {LIKE_COST}
    </button>
  ) : (
    <Link to="/profile" state={{ focusKey: Date.now() }} className="btn btn-tone btn-sm">
      Add key
    </Link>
  );

  return (
    // min-width 0: inside the page's grid, a scrolling row must not widen the page.
    <div style={{ minWidth: 0 }}>
      <ShelfRow
        title={
          <>
            Bottles like this <em>to buy</em>
          </>
        }
        sub={sub}
        below={action}
      >
        {running
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="pick-card skeleton" aria-hidden="true">
                <div className="tile">
                  <BottlePlaceholder />
                </div>
                <div className="pc-body">
                  <div className="sk-line" />
                  <div className="sk-line short" />
                </div>
              </div>
            ))
          : cards.map(({ item, offers, reason, bottle }) => {
              const store = storeById(((offers.find((o) => o.storeId === 'totalwine') ?? offers[0])?.storeId ?? 'totalwine') as StoreId);
              return (
                <PickCard
                  key={item.key}
                  pick={{ item, reason, producer: bottle?.producer, name: bottle ? [bottle.wine, bottle.vintage].filter(Boolean).join(' ') : undefined }}
                  offers={offers}
                  saved={saved.has(item.key)}
                  onWant={async () => (await saveToWant(item, store, reason), toast('Saved to Want to try'))}
                  onPass={async () => (await markNotForMe(item, store, reason), toast('Hidden — it won’t be suggested again'))}
                />
              );
            })}
      </ShelfRow>
      {!running && !failed && cards.length === 0 && (
        <p className="footnote">
          {!hasKey
            ? `Add your Anthropic API key in My palate to find bottles like this at ${stores}.`
            : found
              ? found.checked
                ? found.bottles.length === 0
                  ? found.checked.pages === 0
                    ? `Claude’s search didn’t turn up your stores’ pages for bottles like this, so none could be confirmed (it had ${found.checked.suggested} ideas — see what to look for below). Try “New search” later.`
                    : `Claude looked through ${found.checked.pages} pages on your stores’ websites but couldn’t confirm any bottles like this (it had ${found.checked.suggested} ideas — see what to look for below). Try “New search” later.`
                  : `None of the ${found.bottles.length} bottles found fit your budget or taste filters.`
                : 'No confirmed bottles at your stores this time.'
              : enjoyed
                ? 'Looking for bottles like this at your stores…'
                : `Tap “Find bottles” to search ${stores} for bottles like this.`}
        </p>
      )}
      {!running && found && found.tips.length > 0 && (
        <div className="tone-card" style={{ marginTop: 22 }}>
          <h3>Also look for</h3>
          <ul className="bullets">
            {found.tips.slice(0, 4).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {failed && !running && (
        <p className="small" role="alert" style={{ color: 'var(--danger)', margin: '6px 0 0', padding: '0 var(--text-in)' }}>
          Couldn’t search the stores: {failed}.
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
      <div className="why-label">{wine.list === 'want' ? `On your Want to try list · from ${s.source}` : `Suggested at ${s.source}`}</div>
      {s.reason && <p className="reason">{s.reason}</p>}
      {s.url && (
        <a href={s.url} target="_blank" rel="noreferrer" className="pr-link">
          See it on {possessive(s.source)} website <ArrowUpRight size={14} strokeWidth={1.6} />
        </a>
      )}
    </div>
  );
}
