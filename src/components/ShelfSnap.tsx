import { ArrowUpRight, Bookmark, Check, ImagePlus, Plus, RefreshCw, ShoppingBag, X } from 'lucide-react';
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createWine } from '../db';
import { useWines } from '../hooks';
import { formatPrice } from '../lib/format';
import { getApiKey } from '../lib/labelReader';
import { adoptWant, draftFromItem, markNotForMe, saveToWant } from '../lib/lists';
import {
  checkShelfPrices,
  loadShelf,
  LOOKING_FOR,
  MAX_SHELF_PHOTOS,
  readShelf,
  saveShelf,
  shelfContext,
  shelfDetails,
  shelfTitle,
  type PriceCall,
  type SavedShelf,
  type ShelfBottle,
} from '../lib/shelf';
import { storeById, type SuggestedItem } from '../lib/stores';
import { useAdvisor, useStoreChoice, useTaste } from '../lib/usePicks';
import { ago } from './StorePicks';
import { cleanReason } from './Shelf';
import { useToast } from './Toast';
import { isStaleApp, reloadForUpdate } from '../lib/appUpdate';
import { STYLES } from '../lib/constants';
import { BottleImage } from './BottleImage';

/** "0:07", "1:12" */
function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const CALL_LABEL: Record<PriceCall, string> = { bargain: 'Bargain', fair: 'Fair price', pricey: 'A little pricey', unknown: '' };

/** A shelf bottle as a store listing, so it can go on Want to try or into the collection like any store pick. */
function asItem(b: ShelfBottle, storeId: string): SuggestedItem {
  const title = shelfTitle(b);
  const d = shelfDetails(b);
  const photo = b.catalog?.photo;
  return {
    key: `shelf:${storeId}:${title.toLowerCase()}`,
    title,
    style: d.style,
    price: b.price_usd > 0 ? b.price_usd : null,
    context: [d.region, d.country, ...d.grapes].join(' '),
    url: '',
    // The catalog's bottle photo of this wine (never the shelf photo).
    image: photo?.url ?? null,
    imageSource: photo ? { name: photo.siteName, pageUrl: photo.pageUrl } : undefined,
    vintage: /^\d{4}$/.test(b.vintage) ? Number(b.vintage) : b.vintage === 'NV' ? 'NV' : null,
    country: d.country,
    sizeMl: null,
    producer: b.producer,
    wine: b.wine,
    region: d.region,
    grapes: d.grapes,
    claudeReason: b.why,
  };
}

/** What the page's snap card needs: open the camera or the photo picker. */
export interface SnapHandle {
  camera: () => void;
  library: () => void;
}

/**
 * Snap a shelf: photos in, a ranked shortlist out — read against your own ratings.
 * Started from the page's snap card (through `ref`); `onIdle` says when there's nothing in progress.
 */
export function ShelfSnap({ ref, onIdle }: { ref?: Ref<SnapHandle>; onIdle?: (idle: boolean) => void }) {
  const wines = useWines();
  const taste = useTaste();
  const advisor = useAdvisor();
  const [storeId] = useStoreChoice();
  const store = storeById(storeId);
  const toast = useToast();
  const navigate = useNavigate();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shelf, setShelf] = useState<SavedShelf | null>(loadShelf);
  const [lookingFor, setLookingFor] = useState('');
  // While reading: when it started (for the timer) and the picks written so far.
  const [started, setStarted] = useState<number | null>(null);
  const [early, setEarly] = useState<ShelfBottle[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (started === null) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [started]);

  const thumbs = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  const idle = photos.length === 0 && !busy;
  useEffect(() => onIdle?.(idle), [idle, onIdle]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  const update = (s: SavedShelf | null) => {
    setShelf(s);
    saveShelf(s);
  };

  // After a read, each bottle is looked up in Palate's wine catalog (free) for a photo and its details,
  // a few at a time; the results are saved with the shelf.
  const looking = useRef(new Set<string>());
  useEffect(() => {
    if (!shelf) return;
    const at = shelf.at;
    const todo = shelf.report.bottles
      .map((b, i) => ({ b, i }))
      .filter(({ b, i }) => b.catalog === undefined && !looking.current.has(`${at}:${i}`));
    if (!todo.length) return;
    todo.forEach(({ i }) => looking.current.add(`${at}:${i}`));
    let alive = true;
    (async () => {
      const { catalogForShelfBottle } = await import('../lib/catalog');
      const one = async ({ b, i }: (typeof todo)[number]) => {
        const found = await catalogForShelfBottle(b).catch(() => undefined); // unreachable: try again next visit
        if (!alive || found === undefined) return;
        setShelf((cur) => {
          if (!cur || cur.at !== at) return cur;
          const next = { ...cur, report: { ...cur.report, bottles: cur.report.bottles.map((x, j) => (j === i ? { ...x, catalog: found } : x)) } };
          saveShelf(next);
          return next;
        });
      };
      for (let k = 0; k < todo.length; k += 3) await Promise.all(todo.slice(k, k + 3).map(one));
    })();
    return () => {
      alive = false;
      todo.forEach(({ i }) => looking.current.delete(`${at}:${i}`));
    };
  }, [shelf?.at]);

  const needKey = () => {
    if (getApiKey()) return false;
    toast('Add your Anthropic API key to read shelves');
    navigate('/profile', { state: { focusKey: Date.now() } });
    return true;
  };

  useImperativeHandle(ref, () => ({
    camera: () => !needKey() && camera.current?.click(),
    library: () => !needKey() && library.current?.click(),
  }));

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    // Copy the files now: the input is cleared right after this call, which empties its FileList
    // before React runs the update below (so only the first photo or two used to get through).
    const picked = Array.from(files);
    setPhotos((cur) => [...cur, ...picked].slice(0, MAX_SHELF_PHOTOS));
  };

  const read = async () => {
    if (!photos.length || needKey()) return;
    const ctl = new AbortController();
    abort.current = ctl;
    setError(null);
    setBusy(`Reading ${photos.length === 1 ? 'the shelf' : `${photos.length} photos`}`);
    setStarted(Date.now());
    setEarly([]);
    try {
      const out = await readShelf(photos, shelfContext(wines ?? [], taste), store.name, lookingFor, (p) => !ctl.signal.aborted && setEarly(p.bottles), ctl.signal);
      if (ctl.signal.aborted) return;
      if (!out.ok) {
        setError(`Couldn’t read the shelf: ${out.reason}.`);
        return;
      }
      if (!out.report.bottles.length) {
        setError(out.report.unreadable || 'No bottles could be read. Try closer photos, straight on, with the price tags in view.');
        return;
      }
      // The photos were only for reading the labels: they're let go here, never saved.
      setPhotos([]);
      update({ at: Date.now(), store: store.name, photos: photos.length, lookingFor: lookingFor.trim() || undefined, report: out.report, done: {} });
    } catch (e) {
      if (ctl.signal.aborted) return;
      if (isStaleApp(e) && reloadForUpdate()) return;
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      if (abort.current === ctl) {
        setBusy(null);
        setStarted(null);
        setEarly([]);
      }
    }
  };

  const checkPrices = async () => {
    if (!shelf || needKey()) return;
    const idx = shelf.report.bottles
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.verdict === 'top' && b.price_usd > 0)
      .slice(0, 5)
      .map(({ i }) => i);
    if (!idx.length) {
      setError('None of the picks has a readable price to check.');
      return;
    }
    const ctl = new AbortController();
    abort.current = ctl;
    setError(null);
    setBusy('Checking prices online — about a minute…');
    try {
      const out = await checkShelfPrices(shelf.report, idx, ctl.signal);
      if (ctl.signal.aborted) return;
      if (!out.ok) {
        setError(`Couldn’t check prices: ${out.reason}.`);
        return;
      }
      const bottles = shelf.report.bottles.map((b, i) => {
        const c = out.checks.find((x) => x.index === i);
        if (!c || c.price_call === 'unknown') return b;
        return { ...b, price_call: c.price_call, price_note: `${c.note}${c.sources.length ? ` (${c.sources.slice(0, 3).join(', ')})` : ''}` };
      });
      update({ ...shelf, report: { ...shelf.report, bottles }, pricesChecked: Date.now() });
    } catch (e) {
      if (ctl.signal.aborted) return;
      if (isStaleApp(e) && reloadForUpdate()) return;
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      if (abort.current === ctl) setBusy(null);
    }
  };

  const mark = (b: ShelfBottle, what: 'want' | 'bought' | 'passed') =>
    shelf && update({ ...shelf, done: { ...shelf.done, [shelfTitle(b)]: what } });

  const act = {
    want: async (b: ShelfBottle) => {
      await saveToWant(asItem(b, store.id), store, b.why);
      mark(b, 'want');
      toast('Saved to Want to try');
    },
    bought: async (b: ShelfBottle) => {
      // Into the collection, ready to rate. Its photo comes from the web later, never the shelf photo.
      const draft = { ...draftFromItem(asItem(b, store.id), store, b.why), owned: 1 };
      // Already on Want to try? Move that entry instead of adding a second one.
      const id = (await adoptWant(draft)) ?? (await createWine(draft));
      mark(b, 'bought');
      toast('Added to your collection');
      return id;
    },
    pass: async (b: ShelfBottle) => {
      await markNotForMe(asItem(b, store.id), store, b.why);
      mark(b, 'passed');
    },
  };

  // "You loved this" for bottles already in your collection.
  const rated = (b: ShelfBottle) => {
    if (!advisor) return null;
    const a = advisor.advise({ query: `${shelfTitle(b)} ${b.region}`, style: b.style === 'unknown' ? null : b.style, partial: false });
    return a.exact.find((w) => w.rating) ?? null;
  };

  const report = shelf?.report;
  const top = report?.bottles.filter((b) => b.verdict === 'top') ?? [];
  const good = report?.bottles.filter((b) => b.verdict === 'good') ?? [];
  const elapsed = started === null ? '' : clock(Date.now() - started);
  const status = busy && started !== null ? `${busy}… ${elapsed}${early.length ? ` · ${early.length} ${early.length === 1 ? 'pick' : 'picks'} so far` : ''}` : busy;

  return (
    <section className="shelf-snap" aria-label="Snap a shelf">
      {photos.length > 0 && (
        <div className="shelf-tray">
          <div className="shelf-thumbs">
            {thumbs.map((u, i) => (
              <div key={u} className="shelf-thumb">
                <img src={u} alt={`Shelf photo ${i + 1}`} />
                {!busy && (
                  <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((cur) => cur.filter((_, j) => j !== i))}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {!busy && photos.length < MAX_SHELF_PHOTOS && (
              <button type="button" className="shelf-thumb add" onClick={() => camera.current?.click()} aria-label="Take another photo">
                <Plus size={22} strokeWidth={1.6} />
              </button>
            )}
          </div>
          {!busy && (
            <div className="looking-for">
              <label className="eyebrow" htmlFor="shelf-looking-for">
                Looking for <span className="muted">· optional</span>
              </label>
              <input
                id="shelf-looking-for"
                className="input white"
                value={lookingFor}
                onChange={(e) => setLookingFor(e.target.value)}
                placeholder="e.g. Tuscany, a Super Tuscan"
                enterKeyHint="done"
              />
              <div className="chips" role="group" aria-label="Quick choices">
                {LOOKING_FOR.map((q) => (
                  <button key={q} type="button" className="chip outline" aria-pressed={lookingFor === q} onClick={() => setLookingFor(lookingFor === q ? '' : q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {busy ? (
            <div className="picks-status busy">
              <span role="status">{status}</span>
              <button type="button" className="btn btn-white btn-sm" onClick={() => (abort.current?.abort(), setBusy(null))}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="shelf-tray-actions">
              <button type="button" className="btn btn-wine btn-lg" onClick={read}>
                Read the shelf
              </button>
              <button type="button" className="btn btn-tone btn-lg" onClick={() => library.current?.click()}>
                <ImagePlus size={17} /> Add
              </button>
              <button type="button" className="text-link" onClick={() => setPhotos([])}>
                Clear
              </button>
            </div>
          )}
          <p className="footnote">Photos are only read to find the labels and prices — they’re never saved.</p>
        </div>
      )}

      {busy && !photos.length && (
        <div className="picks-status busy">
          <span role="status">{status}</span>
          <button type="button" className="btn btn-white btn-sm" onClick={() => (abort.current?.abort(), setBusy(null))}>
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p className="small" role="alert" style={{ color: 'var(--danger)', margin: 0, padding: '0 var(--text-in)' }}>
          {error}
        </p>
      )}

      {busy && early.length > 0 && (
        <div className="shelf-results" aria-live="polite">
          <div className="pick-list">
            {early.map((b, i) => (
              <ShelfCard key={shelfTitle(b)} b={b} n={b.verdict === 'top' ? i + 1 : undefined} compact={b.verdict === 'good'} rated={rated(b)} act={act} preview />
            ))}
          </div>
        </div>
      )}

      {report && shelf && !busy && (
        <div className="shelf-results">
          <div className="shelf-results-head">
            <span className="footnote">
              {shelf.photos} {shelf.photos === 1 ? 'photo' : 'photos'} at {shelf.store} · {ago(shelf.at)}
              {shelf.lookingFor ? ` · ${shelf.lookingFor}` : ''}
              {shelf.pricesChecked ? ' · prices checked online' : ''}
            </span>
            <button type="button" className="text-link" onClick={() => update(null)}>
              Clear
            </button>
          </div>
          {report.decision && <p className="reason shelf-summary">{cleanReason(report.decision)}</p>}
          {report.lesson && <p className="shelf-lesson">{cleanReason(report.lesson)}</p>}

          {top.length > 0 && (
            <div className="pick-list">
              {top.map((b, i) => (
                <ShelfCard key={shelfTitle(b)} b={b} n={i + 1} done={shelf.done?.[shelfTitle(b)]} rated={rated(b)} act={act} />
              ))}
            </div>
          )}

          {good.length > 0 && (
            <>
              <h3 className="eyebrow list-title">Also good</h3>
              <div className="pick-list">
                {good.map((b) => (
                  <ShelfCard key={shelfTitle(b)} b={b} compact done={shelf.done?.[shelfTitle(b)]} rated={rated(b)} act={act} />
                ))}
              </div>
            </>
          )}

          {report.unreadable && <p className="footnote">{report.unreadable}</p>}

          {!busy && !shelf.pricesChecked && (
            <div className="picks-status">
              <span>Price calls come from what Claude knows. Want proof before you spend?</span>
              <button type="button" className="btn btn-white btn-sm" onClick={checkPrices}>
                <RefreshCw size={15} strokeWidth={1.8} /> Check prices online
              </button>
            </div>
          )}
        </div>
      )}

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
      <input ref={library} type="file" accept="image/*" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
    </section>
  );
}

function ShelfCard({
  b,
  n,
  compact = false,
  preview = false,
  done,
  rated,
  act,
}: {
  b: ShelfBottle;
  n?: number;
  compact?: boolean;
  /** Still being read: shown without the buttons. */
  preview?: boolean;
  done?: 'want' | 'bought' | 'passed';
  rated: { id: string; rating: string | null; vintage: number | 'NV' | null } | null;
  act: {
    want: (b: ShelfBottle) => Promise<void>;
    bought: (b: ShelfBottle) => Promise<string>;
    pass: (b: ShelfBottle) => Promise<void>;
  };
}) {
  const [boughtId, setBoughtId] = useState<string | null>(null);
  const call = CALL_LABEL[b.price_call];
  const ratedText = rated?.rating
    ? `${rated.rating === 'loved' ? 'You loved' : rated.rating === 'liked' ? 'You liked' : 'You wouldn’t buy again'} ${rated.vintage ? `the ${rated.vintage}` : 'this'}`
    : '';

  if (done === 'passed') {
    return (
      <div className="hidden-row">
        <span>
          Not for me · <em>{b.producer || b.wine}</em>
        </span>
      </div>
    );
  }

  const d = shelfDetails(b);
  const facts = [d.style ? STYLES.find((s) => s.value === d.style)?.label : null, d.region, d.grapes.join(', ')].filter(Boolean).join(' · ');
  const photo = b.catalog?.photo;

  return (
    <article className={`shelf-card${compact ? ' compact' : ''}${photo ? ' has-photo' : ''}`}>
      {photo && (
        <div className="tile sc-photo">
          <BottleImage photo={{ kind: 'remote', url: photo.url, source: { name: photo.siteName, pageUrl: photo.pageUrl, title: '' } }} alt="" />
        </div>
      )}
      <div className="sc-head">
        {n !== undefined && <div className="pr-no">No. {String(n).padStart(2, '0')}</div>}
        {b.producer && <div className="pr-producer">{b.producer}</div>}
        <h3 className="pr-name">{[b.wine || b.producer, b.vintage].filter(Boolean).join(' ')}</h3>
        {facts && <div className="sc-facts">{facts}</div>}
        <div className="sc-price">
          {b.price_usd > 0 ? <strong>{formatPrice(b.price_usd)}</strong> : <span className="muted">Price not read</span>}
          {call && <span className={`price-call ${b.price_call}`}>{call}</span>}
        </div>
        {(b.deal || b.score) && <div className="sc-note">{[b.deal, b.score].filter(Boolean).join(' · ')}</div>}
        {b.price_note && <div className="sc-note">{cleanReason(b.price_note)}</div>}
        {b.where && <div className="sc-where">{b.where}</div>}
        {ratedText && rated && (
          <Link to={`/wine/${rated.id}`} className="sc-rated">
            {ratedText} <ArrowUpRight size={13} strokeWidth={1.6} />
          </Link>
        )}
      </div>
      <div className="pr-why">
        {!compact && <div className="why-label">Why you’ll like it</div>}
        <p className="reason">{cleanReason(b.why)}</p>
        {!compact && b.taste.length > 0 && (
          <div className="taste-tags sc-tags">
            {b.taste.map((t) => (
              <span key={t} className="taste-tag">
                {t}
              </span>
            ))}
          </div>
        )}
        {b.tip && <p className="sc-tip">{cleanReason(b.tip)}</p>}
      </div>
      {!preview && <div className={`pr-actions sc-actions${compact ? ' small' : ''}`}>
        <button type="button" className={`btn btn-dark ${compact ? 'btn-sm' : 'btn-lg'}${done === 'want' ? ' is-saved' : ''}`} disabled={Boolean(done)} onClick={() => act.want(b)}>
          {done === 'want' ? (
            <>
              <Check size={17} /> Saved
            </>
          ) : (
            <>
              <Bookmark size={17} strokeWidth={1.7} /> Want to try
            </>
          )}
        </button>
        {done === 'bought' ? (
          boughtId ? (
            <Link to={`/wine/${boughtId}`} className={`btn btn-wine ${compact ? 'btn-sm' : 'btn-lg'} is-saved`}>
              <Check size={17} /> Rate it
            </Link>
          ) : (
            <span className={`btn btn-wine ${compact ? 'btn-sm' : 'btn-lg'} is-saved`}>
              <Check size={17} /> Bought
            </span>
          )
        ) : (
          <button type="button" className={`btn btn-tone ${compact ? 'btn-sm' : 'btn-lg'}`} disabled={Boolean(done)} onClick={async () => setBoughtId(await act.bought(b))}>
            <ShoppingBag size={16} strokeWidth={1.7} /> Bought it
          </button>
        )}
        {!done && !compact && (
          <button type="button" className="text-link" onClick={() => act.pass(b)}>
            Not for me
          </button>
        )}
      </div>}
    </article>
  );
}
