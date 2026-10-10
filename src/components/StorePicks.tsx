import { ArrowUpRight, RefreshCw, Sparkles, Store as StoreIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllWines, useLists, useWines } from '../hooks';
import { getApiKey } from '../lib/labelReader';
import { markNotForMe, saveToWant } from '../lib/lists';
import { clearStoreList, LIST_TTL, possessive, refreshPogos, requestStockList, requestStoreList, storeById, STORES, type StoreId } from '../lib/stores';
import { shortlist } from '../lib/twStock';
import { MIN_RATED } from '../lib/taste';
import { formatPrice, producerAndName } from '../lib/format';
import { dropReason, priceDrops, type Drop } from '../lib/priceWatch';
import { useAdvisor, useAllStoreItems, useBudget, useRestaurantBudget, useStoreChoice, useStoreMode, useStorePicks, useTaste, useTwStock } from '../lib/usePicks';

/** Rough cost of one Claude store list, shown on the button. */
import { HiddenRow, PickCard, PickRow, pickNames, ShelfRow, type PickLike } from './Shelf';
import { useUndo } from './useUndo';
import { BottleImage } from './BottleImage';
import { BellIcon } from './PriceWatch';
import { useToast } from './Toast';

const BUDGETS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any price' },
  { value: 25, label: 'Under $25' },
  { value: 40, label: 'Under $40' },
  { value: 60, label: 'Under $60' },
  { value: 100, label: 'Under $100' },
];

const RESTAURANT_BUDGETS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any' },
  { value: 50, label: 'Under $50' },
  { value: 80, label: 'Under $80' },
  { value: 120, label: 'Under $120' },
  { value: 200, label: 'Under $200' },
];

export function ago(t: number, now = Date.now()): string {
  const m = Math.round((now - t) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** "Rate a few more" instead of weak guesses. */
export function RatePrompt({ rated }: { rated: number }) {
  const left = MIN_RATED - rated;
  return (
    <div className="rate-prompt">
      <Sparkles size={20} strokeWidth={1.7} />
      <div>
        <strong>
          Rate {left} more {left === 1 ? 'wine' : 'wines'} to get suggestions.
        </strong>
        <div className="small muted">Palate suggests bottles from what you’ve loved and passed on — a few more ratings make that worth trusting.</div>
      </div>
    </div>
  );
}

function usePickActions(storeName: string) {
  const toast = useToast();
  const store = STORES.find((s) => s.name === storeName)!;
  return {
    want: async (p: PickLike) => {
      await saveToWant(p.item, store, p.reason);
      toast('Saved to Want to try');
    },
    pass: (p: PickLike) => markNotForMe(p.item, store, p.reason),
  };
}

/** How much is saved for each store: "8 picks", "Ready", "No list yet". */
function useStoreCounts(): Map<StoreId, string> {
  const entries = useAllStoreItems();
  return useMemo(() => {
    const out = new Map<StoreId, string>();
    for (const store of STORES) {
      const n = (entries ?? []).filter((e) => e.storeId === store.id).length;
      out.set(store.id, n === 0 ? 'No list yet' : store.kind === 'catalog' ? 'Ready' : `${n} ${n === 1 ? 'pick' : 'picks'}`);
    }
    return out;
  }, [entries]);
}

/** Which store and budget: wrapping pills on a phone, a store list on desktop. At a restaurant, just the budget. */
export function StoreChooser({ variant = 'pills' }: { variant?: 'pills' | 'list' }) {
  const [storeId, setStoreId] = useStoreChoice();
  const [budget, setBudget] = useBudget();
  const [mode] = useStoreMode();
  const [tableBudget, setTableBudget] = useRestaurantBudget();
  const counts = useStoreCounts();
  if (mode === 'restaurant') {
    return (
      <div className={`store-chooser ${variant}`}>
        <div className="eyebrow">Budget · per bottle</div>
        <div className="chips" role="group" aria-label="Budget per bottle">
          {RESTAURANT_BUDGETS.map((b) => (
            <button key={b.label} type="button" className="chip outline" aria-pressed={b.value === tableBudget} onClick={() => setTableBudget(b.value)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={`store-chooser ${variant}`}>
      <div className="eyebrow">Store</div>
      {variant === 'list' ? (
        <div className="store-list" role="group" aria-label="Store">
          {STORES.map((s) => (
            <button key={s.id} type="button" aria-pressed={s.id === storeId} onClick={() => setStoreId(s.id)}>
              <span className="store-name">{s.name}</span>
              <span className="store-count">{counts.get(s.id)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="chips" role="group" aria-label="Store">
          {STORES.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={s.id === storeId} onClick={() => setStoreId(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="eyebrow">Budget</div>
      <div className="chips" role="group" aria-label="Budget">
        {BUDGETS.map((b) => (
          <button key={b.label} type="button" className="chip outline" aria-pressed={b.value === budget} onClick={() => setBudget(b.value)}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The store's suggestions on the In store screen: status, picks, what else to look for. */
export function StorePicksPanel() {
  const [storeId] = useStoreChoice();
  const [budget] = useBudget();
  const store = storeById(storeId);
  const { fetchedAt, picks, tips, saved, fromStock } = useStorePicks(storeId, budget, 15);
  const taste = useTaste();
  const advisor = useAdvisor();
  // Total Wine: what your store had in stock when you last imported it with the Chrome extension.
  const stock = useTwStock(store.id === 'totalwine');
  const inStock = stock?.bottles.length ? stock : null;
  const wines = useWines();
  const lists = useLists();
  const actions = usePickActions(store.name);
  const hiding = useUndo();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ store: StoreId; text: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const hasKey = Boolean(getApiKey());

  // A list Claude made clears itself after an hour, also while the app stays open.
  useEffect(() => {
    if (!fetchedAt || store.kind === 'catalog') return;
    const t = window.setTimeout(() => void clearStoreList(store.id), Math.max(0, fetchedAt + LIST_TTL - Date.now()));
    return () => window.clearTimeout(t);
  }, [fetchedAt, store.id, store.kind]);

  const load = async () => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setError(null);
    try {
      if (store.kind === 'catalog') {
        setBusy(`Loading ${possessive(store.name)} wine list…`);
        await refreshPogos(ctl.signal);
      } else {
        const rated = (wines ?? []).filter((w) => w.rating);
        const label = (w: { producer: string; name: string; region: string }) => [w.producer, w.name, w.region && `(${w.region})`].filter(Boolean).join(' ');
        const req = {
          store,
          taste: taste?.summary ?? [],
          loved: rated.filter((w) => w.rating === 'loved').map(label),
          liked: rated.filter((w) => w.rating === 'liked').map(label),
          disliked: rated.filter((w) => w.rating === 'wouldnt').map(label),
          // Your collection first (tried or at home), then saved and dismissed; a long list costs little.
          skip: [...(wines ?? []), ...(lists?.want ?? []), ...(lists?.passed ?? [])].map(label).slice(0, 150),
          budget,
        };
        let out;
        if (inStock && advisor) {
          const short = shortlist(advisor, inStock.bottles, { passed: lists?.passed, budget, usual: taste?.price ?? null, have: wines ?? [] });
          if (!short.length) {
            setError({ store: store.id, text: `Nothing in stock at ${inStock.storeName} fits that budget. Try a higher one.` });
            return;
          }
          setBusy(`Choosing from ${inStock.bottles.length} bottles in stock at ${inStock.storeName}…`);
          out = await requestStockList(req, { storeName: inStock.storeName, importedAt: inStock.importedAt, count: inStock.bottles.length }, short, ctl.signal);
        } else {
          setBusy(`Searching ${possessive(store.name)} website for bottles you’d like — about a minute…`);
          out = await requestStoreList(req, ctl.signal);
        }
        if (!out.ok) setError({ store: store.id, text: `Couldn’t make a list: ${out.reason}.` });
      }
    } catch (e) {
      if (!ctl.signal.aborted) setError({ store: store.id, text: e instanceof Error ? e.message : 'Something went wrong. Try again.' });
    } finally {
      if (abort.current === ctl) setBusy(null);
    }
  };

  if (taste && !taste.enough) return <RatePrompt rated={taste.rated} />;
  if (fetchedAt === undefined) return null;

  const catalog = store.kind === 'catalog';
  const button = busy ? (
    <button type="button" className="btn btn-white btn-sm" onClick={() => (abort.current?.abort(), setBusy(null))}>
      Cancel
    </button>
  ) : catalog ? (
    <button type="button" className="btn btn-white btn-sm" onClick={load}>
      <RefreshCw size={15} strokeWidth={1.8} /> {fetchedAt ? 'Refresh' : 'Load list'}
    </button>
  ) : hasKey ? (
    <button type="button" className="btn btn-white btn-sm" onClick={load}>
      {fetchedAt ? 'New list' : 'Make a list'}
    </button>
  ) : (
    <Link to="/profile" state={{ focusKey: Date.now() }} className="btn btn-white btn-sm">
      Add key
    </Link>
  );

  const status = busy
    ? busy
    : fetchedAt
      ? catalog
        ? `In stock at ${store.name} · updated ${ago(fetchedAt)}`
        : fromStock
          ? `List made ${ago(fetchedAt)} · from ${fromStock.count} bottles in stock at ${fromStock.storeName}`
          : `List made ${ago(fetchedAt)} · ${picks.length} found on ${store.domain}`
      : catalog
        ? `Free. Downloads ${possessive(store.name)} current wine list (about 1 MB), then works without signal.`
        : hasKey
          ? inStock
            ? `Claude picks from the ${inStock.bottles.length} bottles in stock at ${inStock.storeName}, imported ${ago(inStock.importedAt)}. A few seconds.`
            : `Claude searches ${possessive(store.name)} website for bottles that fit your taste. About a minute.`
          : `Needs your Anthropic API key (in My palate) to search ${possessive(store.name)} website.`;

  const shownError = error?.store === store.id ? error.text : null;

  return (
    <section className="store-picks" aria-label={`Picks at ${store.name}`}>
      {!fetchedAt && !busy ? (
        <div className="picks-empty">
          <h2 className="title-lg">
            No list for <em>{store.name}</em> yet.
          </h2>
          <p className="lede">{status}</p>
          <div>{button}</div>
        </div>
      ) : (
        <div className={`picks-status${busy ? ' busy' : ''}`}>
          <span role="status">{status}</span>
          {button}
          {!busy && !catalog && fetchedAt && (
            <button type="button" className="text-link" onClick={() => void clearStoreList(store.id)}>
              Clear
            </button>
          )}
        </div>
      )}
      {shownError && (
        <p className="small" role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
          {shownError}
        </p>
      )}

      {fetchedAt && !busy && picks.length === 0 && (
        <p className="lede">
          {store.kind === 'search' && tips.length
            ? `Claude couldn’t confirm specific bottles on ${possessive(store.name)} website this time — see what to look for below.`
            : budget
              ? 'Nothing on this list fits that budget. Try a higher one.'
              : 'Nothing here matches your taste closely yet.'}
        </p>
      )}
      {picks.length > 0 && (
        <div className="pick-list">
          {picks.map((p, i) =>
            hiding.isPending(p.item.key) ? (
              <HiddenRow key={p.item.key} label={pickNames(p).producer || p.item.title} onUndo={() => hiding.undo(p.item.key)} />
            ) : (
              <PickRow
                key={p.item.key}
                n={i + 1}
                pick={p}
                storeName={store.name}
                domain={store.domain}
                saved={saved.has(p.item.key)}
                onWant={() => actions.want(p)}
                onPass={() => hiding.start(p.item.key, () => actions.pass(p))}
              />
            ),
          )}
        </div>
      )}
      {tips.length > 0 && (
        <div className="tone-card">
          <h3>Also look for</h3>
          <ul className="bullets">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {fetchedAt && (
        <p className="footnote">
          {catalog
            ? `Stock is what ${possessive(store.name)} website shows; it can lag behind the shelf.`
            : fromStock
              ? `Every bottle above was in stock at ${fromStock.storeName} when you imported it ${ago(fromStock.importedAt)}.`
              : `Every bottle above was found on ${possessive(store.name)} website. Stock can lag behind the shelf — tap a link to check your location.`}
        </p>
      )}
    </section>
  );
}

/** "Best bets at Total Wine" on the home screen. */
export function StorePicksRow() {
  // The home screen follows Total Wine, the main store; other stores live on the In-store screen.
  const storeId = 'totalwine';
  const store = storeById(storeId);
  const { fetchedAt, picks, saved } = useStorePicks(storeId, null, 10);
  const actions = usePickActions(store.name);
  const hiding = useUndo();
  const all = useAllWines();
  const drops = useMemo(() => (all ? priceDrops(all) : []), [all]);
  // Drops at Total Wine rank first in Best bets.
  const here = drops.filter((d) => d.now.store === store.name);
  if (fetchedAt === undefined) return null;
  const dropsRow = drops.length > 0 && <PriceDropsLink drops={drops} />;
  if (!fetchedAt || picks.length === 0) {
    // Loose in the page's group (no wrapper), so a computer can hide the card on its own.
    return (
      <>
        {dropsRow}
        <Link to="/store" className="cta-card lift strip">
          <StoreIcon size={20} strokeWidth={1.7} />
          <span className="cta-text">
            <strong>
              Heading to <em>{store.name}?</em>
            </strong>
            <span className="small muted">See which bottles there fit your taste.</span>
          </span>
          <span className="btn btn-wine cta-button">Open In store →</span>
        </Link>
      </>
    );
  }
  return (
    <div className="best-bets">
      {dropsRow}
      <ShelfRow
        title={
          <>
            Best bets <em>at {store.name}</em>
          </>
        }
        sub={`${picks.length} found on ${store.domain} · ${ago(fetchedAt)}`}
        arrows
        grid={{}}
        action={
          <Link to="/store" className="text-link">
            See all
          </Link>
        }
      >
        {here.map((d) => (
          <DropPick key={`drop-${d.wine.id}`} drop={d} />
        ))}
        {picks.map((p) =>
          hiding.isPending(p.item.key) ? (
            <HiddenRow key={p.item.key} card label={pickNames(p).producer || p.item.title} onUndo={() => hiding.undo(p.item.key)} />
          ) : (
            <PickCard
              key={p.item.key}
              pick={p}
              storeName={store.name}
              saved={saved.has(p.item.key)}
              onWant={() => actions.want(p)}
              onPass={() => hiding.start(p.item.key, () => actions.pass(p))}
            />
          ),
        )}
      </ShelfRow>
    </div>
  );
}

/** "Price drops" at the top of Best bets: how many watched bottles got cheaper, to the watch screen. */
function PriceDropsLink({ drops }: { drops: Drop[] }) {
  const n = drops.length;
  return (
    <Link to="/watch" className="drops-link lift">
      <span className="drops-bell">
        <BellIcon size={20} filled />
      </span>
      <span className="drops-text">
        <span className="eyebrow">Price drops</span>
        <strong>
          {n} {n === 1 ? 'favourite' : 'favourites'} <em>got cheaper</em>
        </strong>
        <span className="small muted drops-names">
          {drops
            .slice(0, 3)
            .map((d) => `${producerAndName(d.wine)} ${formatPrice(d.now.price)}`)
            .join(' · ')}
        </span>
      </span>
      <span className="text-link">See →</span>
    </Link>
  );
}

/** A watched bottle that got cheaper at this store, first in Best bets. */
function DropPick({ drop }: { drop: Drop }) {
  const { wine, now, was } = drop;
  const name = [wine.name || wine.producer, wine.vintage ?? ''].filter(Boolean).join(' ');
  return (
    <div className="pick-card lift drop-pick">
      <Link to={`/wine/${wine.id}`} className="tile" aria-label={`Open ${name}`}>
        <span className="drop-tag">Price drop</span>
        <BottleImage photo={wine.photo} alt="" />
      </Link>
      <div className="pc-body">
        <div className="pc-producer">{wine.name && wine.producer ? wine.producer : ' '}</div>
        <div className="pc-name">{name}</div>
        <div className="pc-price">
          <strong className="drop-now">{formatPrice(now.price)}</strong> {was !== null && was > now.price && <s>{formatPrice(was)}</s>} <span>{now.store}</span>
        </div>
        <p className="pc-reason">{dropReason(drop)}</p>
      </div>
      <div className="pc-actions">
        <a href={now.url} target="_blank" rel="noreferrer" className="pc-link drop-pick-link">
          <span className="pc-link-text">Link</span> <ArrowUpRight size={15} strokeWidth={1.6} />
        </a>
      </div>
    </div>
  );
}
