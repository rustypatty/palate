import { ExternalLink, Store as StoreIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLists } from '../hooks';
import { markNotForMe, saveToWant } from '../lib/lists';
import { bottlesLikeThis } from '../lib/recommend';
import { possessive, refreshPogos, storeById, type StoreId } from '../lib/stores';
import { useAdvisor, useAllStoreItems, useBudget } from '../lib/usePicks';
import type { Wine } from '../types';
import { PickCard, ShelfRow } from './Shelf';
import { useToast } from './Toast';

/** Bottles you could buy that are like this one, from every store list saved on this device. */
export function MoreLikeThis({ wine }: { wine: Wine }) {
  const lists = useLists();
  const advisor = useAdvisor();
  const entries = useAllStoreItems();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budget] = useBudget();

  const like = useMemo(
    () => (advisor && entries && lists ? bottlesLikeThis(wine, entries, advisor, lists.passed, 10, budget) : undefined),
    [wine, entries, advisor, lists, budget],
  );
  const saved = useMemo(() => new Set((lists?.want ?? []).map((w) => w.suggestion?.key).filter(Boolean)), [lists]);
  const stores = useMemo(() => [...new Set((entries ?? []).map((e) => e.storeId))].map((id) => storeById(id).name), [entries]);

  if (!like || !entries) return null;

  if (!entries.length) {
    return (
      <section className="shelf">
        <div className="shelf-head">
          <div>
            <h2>Bottles like this to buy</h2>
            <p>From the stores you shop at, ranked for your taste</p>
          </div>
        </div>
        <button
          type="button"
          className="cta-card"
          style={{ width: '100%', border: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              await refreshPogos();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Couldn’t load the list. Try again.');
            } finally {
              setLoading(false);
            }
          }}
        >
          <StoreIcon size={18} />
          <span>
            <strong>{loading ? 'Loading Pogo’s list…' : 'Find bottles like this at Pogo’s'}</strong>
            <span className="small muted"> Free · about 1 MB. Store lists you make in In store show up here too.</span>
          </span>
        </button>
        {error && (
          <p className="small" role="alert" style={{ color: 'var(--danger)', margin: '6px 0 0' }}>
            {error}
          </p>
        )}
      </section>
    );
  }

  if (!like.length) {
    return (
      <section className="shelf">
        <div className="shelf-head">
          <div>
            <h2>Bottles like this to buy</h2>
            <p>
              Nothing close at {stores.join(' or ')}
              {budget ? ` under $${budget}` : ''} right now.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <ShelfRow title="Bottles like this to buy" sub={`At ${stores.join(', ')}${budget ? ` · under $${budget}` : ''} · closest first`}>
      {like.map(({ storeId, item, reason }) => {
        const store = storeById(storeId as StoreId);
        return (
          <PickCard
            key={item.key}
            pick={{ item, reason }}
            storeName={store.name}
            saved={saved.has(item.key)}
            onWant={async () => (await saveToWant(item, store, reason), toast('Saved to Want to try'))}
            onPass={async () => (await markNotForMe(item, store, reason), toast('Hidden — it won’t be suggested again'))}
          />
        );
      })}
    </ShelfRow>
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
