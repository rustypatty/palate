import { ExternalLink } from 'lucide-react';
import { useMemo } from 'react';
import { useLists, useWines } from '../hooks';
import { markNotForMe, saveToWant } from '../lib/lists';
import { moreLikeThis, scoreCandidate, similarItems } from '../lib/recommend';
import { storeById, possessive } from '../lib/stores';
import { useAdvisor, useStoreChoice, useStorePicks } from '../lib/usePicks';
import type { Wine } from '../types';
import { MiniWineCard, PickCard, ShelfRow, type PickLike } from './Shelf';
import { useToast } from './Toast';

/** Your wines like this one, plus similar bottles at the store you last picked. */
export function MoreLikeThis({ wine }: { wine: Wine }) {
  const wines = useWines();
  const lists = useLists();
  const advisor = useAdvisor();
  const [storeId] = useStoreChoice();
  const store = storeById(storeId);
  const { items, saved } = useStorePicks(storeId, null, 0);
  const toast = useToast();

  const own = useMemo(() => (wines && lists ? moreLikeThis(wine, [...wines, ...lists.want], 8) : []), [wine, wines, lists]);
  const fromStore = useMemo(() => {
    if (!advisor) return [];
    return similarItems(wine, items, 6)
      .map((item) => {
        const p = scoreCandidate(advisor, item, { passed: lists?.passed });
        // A bottle you'd skip isn't "like this" in a useful way.
        if (!p && advisor.advise({ query: item.title, style: item.style, partial: false }).verdict.level === 'skip') return null;
        return p ?? { item, reason: `Similar to this one, at ${store.name}` };
      })
      .filter((p): p is PickLike => p !== null)
      .slice(0, 4);
  }, [wine, items, advisor, lists, store.name]);

  if (!own.length && !fromStore.length) return null;
  return (
    <ShelfRow title="More like this" sub={fromStore.length ? `From your wines and ${store.name}` : 'From your wines'}>
      {own.map((w) => (
        <MiniWineCard key={w.id} wine={w} note={w.list === 'want' ? 'Want to try' : undefined} />
      ))}
      {fromStore.map((p) => (
        <PickCard
          key={p.item.key}
          pick={p}
          saved={saved.has(p.item.key)}
          onWant={async () => (await saveToWant(p.item, store, p.reason), toast('Saved to Want to try'))}
          onPass={async () => (await markNotForMe(p.item, store, p.reason), toast('Hidden — it won’t be suggested again'))}
        />
      ))}
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
