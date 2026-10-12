import { Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottlePlaceholder } from '../components/BottleSilhouette';
import { fetchShared, type SharedList, type SharedWine } from '../lib/share';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function Photo({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="tile shared-stage">
      {url && !failed ? <img className="bottle" src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <BottlePlaceholder />}
    </span>
  );
}

function WineCard({ w }: { w: SharedWine }) {
  const [open, setOpen] = useState(false);
  const place = [w.region, w.country].filter(Boolean).join(', ');
  const meta = [place, w.grapes.slice(0, 3).join(', ')].filter(Boolean).join(' · ');
  return (
    <article className="shared-wine">
      <Photo url={w.photo} />
      <div className="shared-text">
        {w.producer && w.name && <div className="shared-producer">{w.producer}</div>}
        <h2 className="shared-name">
          {[w.name || w.producer, w.vintage ?? ''].filter(Boolean).join(' ')}
        </h2>
        {meta && <div className="shared-meta">{meta}</div>}
        <div className="shared-loved">
          <Heart size={12} fill="currentColor" strokeWidth={0} /> Loved
        </div>
        {w.about && (
          <>
            {w.about.whatItIs && <p className={`shared-about${open ? '' : ' clamp'}`}>{w.about.whatItIs}</p>}
            {open && w.about.taste && <p className="shared-about">{w.about.taste}</p>}
            <button type="button" className="text-link shared-more" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? 'Less' : 'More'}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

/** The page a friend sees at <app>/loved/: read-only, no sign-in, none of the app around it. */
export function SharedPage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; list: SharedList | null } | { status: 'error' }>({ status: 'loading' });
  useEffect(() => {
    fetchShared()
      .then((list) => setState({ status: 'ready', list }))
      .catch(() => setState({ status: 'error' }));
  }, []);

  const list = state.status === 'ready' ? state.list : null;
  const when = list ? new Date(list.sharedAt) : null;
  return (
    <main className="shared-page">
      <header className="shared-top">
        <span className="wordmark">
          Palate<span className="dot" aria-hidden="true" />
        </span>
      </header>
      {state.status === 'loading' ? (
        <p className="shared-status">Opening the list…</p>
      ) : state.status === 'error' ? (
        <p className="shared-status">Couldn’t load the list. Check your connection and try again.</p>
      ) : !list || list.wines.length === 0 ? (
        <section className="shared-intro">
          <h1 className="headline">
            Nothing <em>shared</em> right now
          </h1>
          <p className="lede">This list isn’t being shared at the moment.</p>
        </section>
      ) : (
        <>
          <section className="shared-intro">
            <div className="eyebrow">
              {list.wines.length} {list.wines.length === 1 ? 'bottle' : 'bottles'}
              {when && ` · shared ${MONTHS[when.getMonth()]} ${when.getFullYear()}`}
            </div>
            <h1 className="headline">
              {list.name}’s <em>loved</em> wines
            </h1>
            <p className="lede">The bottles I’d happily buy again.</p>
          </section>
          <div className="shared-list">
            {list.wines.map((w) => (
              <WineCard key={w.id} w={w} />
            ))}
          </div>
        </>
      )}
      <footer className="shared-foot">Made with Palate</footer>
    </main>
  );
}
