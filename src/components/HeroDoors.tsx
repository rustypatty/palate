import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { storeById } from '../lib/stores';
import { useBudget, useStoreChoice, useStorePicks } from '../lib/usePicks';
import type { Wine } from '../types';

/**
 * Desktop: two doorways inside the hero, "Tonight" (open a bottle from your cellar) and
 * "In store" (best bets at your store). In the evening Tonight leads; otherwise In store.
 */
export function HeroDoors({ wines }: { wines: Wine[] }) {
  const location = useLocation();
  const [storeId] = useStoreChoice();
  const [budget] = useBudget();
  const { fetchedAt, picks } = useStorePicks(storeId, budget, 15);
  const atHome = wines.reduce((t, w) => t + (w.owned > 0 ? w.owned : 0), 0);
  const evening = new Date().getHours() >= 16;
  const tonightLeads = atHome > 0 && evening;
  const ready = fetchedAt ? picks.length : 0;
  return (
    <div className="hero-doors">
      {atHome > 0 && (
        <Door
          to="/tonight"
          state={{ background: location }}
          primary={tonightLeads}
          eyebrow="Open from your cellar"
          title={
            <>
              What are you <em>cooking?</em>
            </>
          }
          sub={`${atHome} ${atHome === 1 ? 'bottle' : 'bottles'} at home`}
        />
      )}
      <Door
        to="/store"
        primary={!tonightLeads}
        eyebrow="Heading out?"
        title={<em>{storeById(storeId).name}</em>}
        sub={ready ? `${ready} best ${ready === 1 ? 'bet' : 'bets'} ready` : 'Build a list'}
      />
    </div>
  );
}

function Door({ to, state, primary, eyebrow, title, sub }: { to: string; state?: unknown; primary: boolean; eyebrow: string; title: ReactNode; sub: string }) {
  return (
    <Link to={to} state={state} className={`hero-door${primary ? ' primary' : ''}`}>
      <span className="eyebrow">{eyebrow}</span>
      <span className="hero-door-title">{title}</span>
      <span className="hero-door-sub">{sub}</span>
      <span className="hero-door-go" aria-hidden="true">
        <ArrowRight size={18} strokeWidth={1.8} />
      </span>
    </Link>
  );
}
