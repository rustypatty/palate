import { Lightbulb, RefreshCw, Sparkles, Store as StoreIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLists, useWines } from '../hooks';
import { getApiKey } from '../lib/labelReader';
import { markNotForMe, saveToWant } from '../lib/lists';
import { refreshPogos, requestStoreList, storeById, STORES, possessive } from '../lib/stores';
import { MIN_RATED } from '../lib/taste';
import { useBudget, useStoreChoice, useStorePicks, useTaste } from '../lib/usePicks';
import { PickCard, PickRow, ShelfRow, type PickLike } from './Shelf';
import { useToast } from './Toast';

const BUDGETS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any price' },
  { value: 25, label: 'Under $25' },
  { value: 40, label: 'Under $40' },
  { value: 60, label: 'Under $60' },
  { value: 100, label: 'Under $100' },
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
      <Sparkles size={18} />
      <div>
        <strong>Rate {left} more {left === 1 ? 'wine' : 'wines'} to get suggestions.</strong>
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
    pass: async (p: PickLike) => {
      await markNotForMe(p.item, store, p.reason);
      toast('Hidden — it won’t be suggested again');
    },
  };
}

/** The full section on the In-store screen. */
export function StorePicksPanel() {
  const [storeId, setStoreId] = useStoreChoice();
  const [budget, setBudget] = useBudget();
  const store = storeById(storeId);
  const { fetchedAt, picks, tips, saved } = useStorePicks(storeId, budget, 15);
  const taste = useTaste();
  const wines = useWines();
  const lists = useLists();
  const actions = usePickActions(store.name);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const hasKey = Boolean(getApiKey());

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
        setBusy(`Searching ${possessive(store.name)} website for bottles you’d like — about a minute…`);
        const rated = (wines ?? []).filter((w) => w.rating);
        const label = (w: { producer: string; name: string; region: string }) => [w.producer, w.name, w.region && `(${w.region})`].filter(Boolean).join(' ');
        const out = await requestStoreList(
          {
            store,
            taste: taste?.summary ?? [],
            loved: rated.filter((w) => w.rating === 'loved').map(label),
            liked: rated.filter((w) => w.rating === 'liked').map(label),
            disliked: rated.filter((w) => w.rating === 'wouldnt').map(label),
            // Saved and dismissed first: those are the ones Claude can't know about otherwise.
            skip: [...(lists?.want ?? []), ...(lists?.passed ?? []), ...(wines ?? [])].map(label).slice(0, 40),
            budget,
          },
          ctl.signal,
        );
        if (!out.ok) setError(`Couldn’t make a list: ${out.reason}.`);
      }
    } catch (e) {
      if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      if (abort.current === ctl) setBusy(null);
    }
  };

  const enough = taste?.enough ?? false;

  return (
    <section className="store-picks">
      <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
        <StoreIcon size={14} /> Picks for this store
      </h2>
      <div className="chips" role="group" aria-label="Store">
        {STORES.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={s.id === storeId} onClick={() => (setStoreId(s.id), setError(null))}>
            {s.name}
          </button>
        ))}
      </div>
      <div className="chips chips-sm" role="group" aria-label="Budget">
        {BUDGETS.map((b) => (
          <button key={b.label} type="button" className="chip" aria-pressed={b.value === budget} onClick={() => setBudget(b.value)}>
            {b.label}
          </button>
        ))}
      </div>

      {!enough && taste ? (
        <RatePrompt rated={taste.rated} />
      ) : (
        <>
          <div className="picks-status">
            {busy ? (
              <span className="muted small" role="status">
                {busy}
              </span>
            ) : fetchedAt ? (
              <span className="muted small">
                {store.kind === 'catalog' ? `In stock at ${store.name} · updated ${ago(fetchedAt)}` : `List made ${ago(fetchedAt)}`}
              </span>
            ) : (
              <span className="muted small">
                {store.kind === 'catalog'
                  ? `Free. Downloads ${possessive(store.name)} current wine list (about 1 MB), then works without signal.`
                  : hasKey
                    ? `Claude searches ${possessive(store.name)} website for bottles that fit your taste. About 25¢, about a minute.`
                    : `Needs your Anthropic API key (My palate) to search ${possessive(store.name)} website.`}
              </span>
            )}
            {busy ? (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => (abort.current?.abort(), setBusy(null))}>
                Cancel
              </button>
            ) : store.kind === 'catalog' ? (
              <button type="button" className={`btn btn-sm ${fetchedAt ? 'btn-outline' : 'btn-dark'}`} onClick={load}>
                <RefreshCw size={15} /> {fetchedAt ? 'Refresh' : `Load ${possessive(store.name)} list`}
              </button>
            ) : hasKey ? (
              <button type="button" className={`btn btn-sm ${fetchedAt ? 'btn-outline' : 'btn-dark'}`} onClick={load}>
                <Sparkles size={15} /> {fetchedAt ? 'New list · ~25¢' : 'What should I look for?'}
              </button>
            ) : (
              <Link to="/profile" state={{ focusKey: Date.now() }} className="btn btn-sm btn-outline">
                Add key
              </Link>
            )}
          </div>
          {error && (
            <p className="small" role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
              {error}
            </p>
          )}

          {fetchedAt && !busy && picks.length === 0 && (
            <p className="small muted" style={{ margin: 0 }}>
              {store.kind === 'search' && tips.length
                ? `Claude couldn’t confirm specific bottles on ${possessive(store.name)} website this time — see what to look for below.`
                : budget
                  ? 'Nothing here fits your taste at this budget. Try a higher one.'
                  : 'Nothing here matches your taste closely yet.'}
            </p>
          )}
          {picks.length > 0 && (
            <div className="pick-list">
              {picks.map((p) => (
                <PickRow
                  key={p.item.key}
                  pick={p}
                  storeName={store.name}
                  saved={saved.has(p.item.key)}
                  onWant={() => actions.want(p)}
                  onPass={() => actions.pass(p)}
                />
              ))}
            </div>
          )}
          {tips.length > 0 && (
            <div className="tips-box">
              <div className="small" style={{ fontWeight: 650, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lightbulb size={15} /> Also look for
              </div>
              <ul>
                {tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {fetchedAt && (
            <p className="small muted" style={{ margin: 0 }}>
              {store.kind === 'catalog'
                ? `Stock is what ${possessive(store.name)} website shows; it can lag behind the shelf.`
                : `Every bottle above was found on ${possessive(store.name)} website. Tap a bottle to check your location has it.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Compact row for the home screen. */
export function StorePicksRow() {
  // The home screen follows Total Wine, the main store; other stores live on the In-store screen.
  const storeId = 'totalwine';
  const store = storeById(storeId);
  const { fetchedAt, picks, saved } = useStorePicks(storeId, null, 10);
  const actions = usePickActions(store.name);
  if (fetchedAt === undefined) return null;
  if (!fetchedAt || picks.length === 0) {
    return (
      <Link to="/store" className="cta-card">
        <StoreIcon size={18} />
        <span>
          <strong>Heading to {store.name}?</strong>
          <span className="small muted"> See which bottles there fit your taste.</span>
        </span>
      </Link>
    );
  }
  return (
    <ShelfRow
      title={`Best bets at ${store.name}`}
      sub={store.kind === 'catalog' ? `In stock · updated ${ago(fetchedAt)}` : `From ${possessive(store.name)} website`}
      action={
        <Link to="/store" className="shelf-link">
          See all
        </Link>
      }
    >
      {picks.map((p) => (
        <PickCard key={p.item.key} pick={p} saved={saved.has(p.item.key)} onWant={() => actions.want(p)} onPass={() => actions.pass(p)} />
      ))}
    </ShelfRow>
  );
}
