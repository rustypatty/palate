import { Barcode, Bookmark, Camera, Heart, Plus, Search, Tag, Type, Wine as WineGlass, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { BottleImage, BottlePlaceholder } from '../components/BottleImage';
import { LabelSnap } from '../components/LabelSnap';
import { cleanReason, MiniWineCard, ShelfRow } from '../components/Shelf';
import { PhotoChoices } from '../components/PhotoChoices';
import { useToast } from '../components/Toast';
import { ShelfSnap, type SnapHandle } from '../components/ShelfSnap';
import { SnapCard, type SnapCardContent } from '../components/SnapCard';
import { WineListSnap } from '../components/WineListSnap';
import { StoreChooser, StorePicksPanel } from '../components/StorePicks';
import { WineRow } from '../components/WineCard';
import { useDebounced, useLists, useWines } from '../hooks';
import { STYLES } from '../lib/constants';
import { formatPrice } from '../lib/format';
import { lookupBarcode } from '../lib/imageSearch';
import { photoFromUrl } from '../lib/image';
import { advise, describeCounts, detectStyle, type Signal } from '../lib/insights';
import { LabelReadError, lookUpLabel, readingToDraft, readingToQuery, withLookup, type LabelReading, type WineLookup } from '../lib/labelReader';
import { matchesWant } from '../lib/lists';
import { storeById } from '../lib/stores';
import { useRestaurantBudget, useStoreChoice, useStoreMode, useTaste } from '../lib/usePicks';
import { coachBottle, VERDICT_LABEL, type BottleCoach } from '../lib/coach';
import { shelfContext } from '../lib/shelf';
import { tokens } from '../lib/text';
import { isStaleApp, reloadForUpdate } from '../lib/appUpdate';
import type { WineDraft, WineStyle } from '../types';
import type { AddPrefill } from './WineFormPage';

const KIND_LABEL: Record<Signal['kind'], string> = {
  producer: 'Producer',
  grape: 'Grape',
  region: 'Region',
  area: 'Area',
  country: 'Country',
  style: 'Style',
};

function Meter({ s }: { s: Signal }) {
  const total = s.counts.loved + s.counts.liked + s.counts.wouldnt;
  if (!total) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="meter" aria-hidden="true">
      <div className="meter-bar">
        <i className="m-loved" style={{ width: pct(s.counts.loved) }} />
        <i className="m-liked" style={{ width: pct(s.counts.liked) }} />
        <i className="m-wouldnt" style={{ width: pct(s.counts.wouldnt) }} />
      </div>
    </div>
  );
}

type Mode = 'shop' | 'restaurant';

const CARD: Record<Mode, SnapCardContent> = {
  shop: {
    id: 'shop',
    icon: <Camera size={22} strokeWidth={1.6} />,
    title: 'Snap a bottle',
    line: 'Point at the label. I’ll tell you right away if it’s for you.',
    link: 'or snap a whole shelf (several photos)',
    label: 'Snap a bottle: take a photo',
  },
  restaurant: {
    id: 'restaurant',
    icon: <WineGlass size={22} strokeWidth={1.6} />,
    title: 'Snap the wine list',
    line: 'One photo per page, straight on. Ask what to order for your taste.',
    link: 'or choose from photos (up to 10 pages)',
    label: 'Snap the wine list: take a photo',
  },
};

/** "In a shop · At a restaurant". */
function ModeSwitch() {
  const [mode, setMode] = useStoreMode();
  return (
    <div className="mode-switch" role="group" aria-label="Where are you?">
      {(['shop', 'restaurant'] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
          {m === 'shop' ? 'In a shop' : 'At a restaurant'}
        </button>
      ))}
    </div>
  );
}

/** The coach's answer about a snapped bottle. */
function CoachCard({ coach }: { coach: { status: 'pending' } | { status: 'done'; answer: BottleCoach } | { status: 'error'; reason: string } }) {
  if (coach.status === 'pending') {
    return (
      <div className="coach-card pending" aria-live="polite">
        <span className="eyebrow">Your coach</span>
        <p className="muted small">Thinking about this bottle for you…</p>
      </div>
    );
  }
  if (coach.status === 'error') {
    return <p className="small" style={{ color: 'var(--warn)', margin: 0 }}>The coach couldn’t answer ({coach.reason}).</p>;
  }
  const c = coach.answer;
  const parts: [string, string][] = [
    ['What it is', c.what_it_is],
    ['How it will taste', c.taste],
    ['For you', c.fit],
    ['Value', c.value],
    ['Serve it', c.serve],
  ];
  return (
    <div className="coach-card" aria-live="polite">
      <span className={`coach-verdict ${c.verdict}`}>{VERDICT_LABEL[c.verdict]}</span>
      <h2 className="coach-headline">{cleanReason(c.headline)}</h2>
      {parts
        .filter(([, text]) => text.trim())
        .map(([title, text]) => (
          <div key={title} className="coach-part">
            <div className="eyebrow">{title}</div>
            <p>{cleanReason(text)}</p>
          </div>
        ))}
      {c.caveat.trim() && <p className="coach-caveat">{cleanReason(c.caveat)}</p>}
    </div>
  );
}

/** Arriving from a scan elsewhere: what to check. */
export interface CheckPrefill {
  check: string;
  barcode: string;
}

export function InStorePage() {
  const wines = useWines();
  const navigate = useNavigate();
  const toast = useToast();
  const prefill = useLocation().state as CheckPrefill | null;
  const [query, setQuery] = useState(prefill?.check ?? '');
  const [style, setStyle] = useState<WineStyle | null>(null);
  const [priceText, setPriceText] = useState('');
  const [barcode, setBarcode] = useState(prefill?.barcode ?? '');
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [typing, setTyping] = useState(Boolean(prefill));
  const checkRef = useRef<HTMLElement>(null);
  // Load the label, shelf and wine-list readers now. If Palate was updated while it was open,
  // the old version's readers are gone from the site: reload now, before any photos are taken,
  // rather than losing them halfway through a read.
  useEffect(() => {
    Promise.all([import('../lib/labelClient'), import('../lib/shelfClient'), import('../lib/wineListClient')]).catch((e: unknown) => {
      if (isStaleApp(e)) reloadForUpdate();
    });
  }, []);
  const loaded = wines !== undefined;
  const scrolled = useRef(false);
  useEffect(() => {
    // Once the page is there, bring the check into view.
    if (!prefill || !loaded || scrolled.current) return;
    scrolled.current = true;
    checkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!prefill.check) inputRef.current?.focus({ preventScroll: true });
  }, [loaded]);
  const [storeId] = useStoreChoice();
  const store = storeById(storeId);
  const [mode, setMode] = useStoreMode();
  // Arriving with a bottle to check (a scan elsewhere): that's a shop task.
  useEffect(() => {
    if (prefill && mode !== 'shop') setMode('shop');
  }, []);
  const [tableBudget] = useRestaurantBudget();
  const snap = useRef<SnapHandle>(null);
  // In a shop, the card snaps one bottle; the whole-shelf snap is its secondary link.
  const bottle = useRef<SnapHandle>(null);
  const resultRef = useRef<HTMLElement>(null);
  // The card hides while photos are in the tray or being read.
  const [snapIdle, setSnapIdle] = useState(true);
  const [label, setLabel] = useState<{
    reading: LabelReading | null;
    photo: File;
    lookup?: 'pending' | 'done' | 'none';
    found?: WineLookup | null;
    failReason?: string;
    coach?: { status: 'pending' } | { status: 'done'; answer: BottleCoach } | { status: 'error'; reason: string };
  } | null>(null);
  const taste = useTaste();
  const labelUrl = useMemo(() => (label ? URL.createObjectURL(label.photo) : null), [label?.photo]);
  useEffect(() => () => void (labelUrl && URL.revokeObjectURL(labelUrl)), [labelUrl]);
  // A new bottle snap: bring its answer up, right under the card.
  useEffect(() => {
    if (label?.photo) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [label?.photo]);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = useDebounced(query, 150);
  const price = priceText ? Number(priceText) : null;

  const advice = useMemo(
    () => (wines && (q.trim() || style) ? advise(wines, { query: q, style, price }, formatPrice) : null),
    [wines, q, style, price],
  );

  const lists = useLists();
  // Is the bottle in front of you one you saved to try?
  const wanted = useMemo(() => (q.trim() ? lists?.want.find((w) => matchesWant(w, q)) : undefined), [lists, q]);

  const safeBets = useMemo(
    () => (wines ?? []).filter((w) => w.rating === 'loved').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    [wines],
  );

  const onDetected = useCallback(
    async (code: string) => {
      setScanning(false);
      setBarcode(code);
      const mine = wines?.find((w) => w.barcode === code);
      if (mine) {
        navigate(`/wine/${mine.id}`);
        return;
      }
      setLookingUp(true);
      try {
        const found = await lookupBarcode(code);
        if (found && (found.title || found.brand)) {
          const text = [found.brand, found.title].filter(Boolean).join(' ');
          setQuery(text);
          toast('Found it — checking your history');
        } else {
          setQuery(code);
          toast('Barcode not recognised. Type the name from the label.');
          inputRef.current?.focus();
        }
      } catch {
        setQuery(code);
        toast('Couldn’t look up that barcode offline. Type the name instead.');
      } finally {
        setLookingUp(false);
      }
    },
    [wines, navigate, toast],
  );

  const saveBottle = async () => {
    if (label?.reading) {
      // Only a photo found on the web is kept; your snap was just for reading the label.
      const clean = label.found?.photo;
      const photo = clean ? await photoFromUrl(clean.url, { name: clean.siteName, pageUrl: clean.pageUrl, title: clean.title }) : null;
      const coached = label.coach?.status === 'done' ? label.coach.answer : null;
      const about = label.found?.about ?? (coached ? { text: coached.taste, sourceName: 'Palate’s coach (expected style)', sourceUrl: '' } : null);
      const draft: Partial<WineDraft> = { ...readingToDraft(label.reading), price, barcode, owned: 0, photo, about };
      if (style) draft.style = style;
      if (!draft.region && label.found?.region) draft.region = label.found.region;
      if (!draft.country && label.found?.country) draft.country = label.found.country;
      navigate('/add', { state: { draft } satisfies AddPrefill });
      return;
    }
    const producerSignal = advice?.signals.find((s) => s.kind === 'producer');
    let name = query.trim();
    let producer = '';
    if (producerSignal) {
      producer = producerSignal.value;
      const drop = new Set(tokens(producer));
      name = query
        .split(/\s+/)
        .filter((w) => !tokens(w).every((t) => drop.has(t)))
        .join(' ')
        .trim();
    }
    const yearMatch = name.match(/\b(19|20)\d{2}\b/);
    const vintage = yearMatch ? Number(yearMatch[0]) : null;
    if (yearMatch) name = name.replace(yearMatch[0], '').replace(/\s+/g, ' ').trim();
    const draft: Partial<WineDraft> = {
      producer,
      name,
      vintage,
      style: style ?? detectStyle(query),
      price,
      barcode,
      owned: 0,
    };
    navigate('/add', { state: { draft } satisfies AddPrefill });
  };

  if (wines === undefined) return null;
  const hasInput = Boolean(query.trim() || style);
  const showInput = typing || hasInput || Boolean(label);
  const clear = () => {
    setQuery('');
    setBarcode('');
    setStyle(null);
    setLabel(null);
  };

  const labelSnap = (
    <LabelSnap
      ref={bottle}
      bare
      onStart={(photo) => setLabel({ reading: null, photo })}
      onRead={(reading, photo) => {
        setLabel({ reading, photo, lookup: 'pending', coach: reading.is_wine_label ? { status: 'pending' } : undefined });
        if (!reading.is_wine_label) return;
        // Confirm style/grapes (Palate's catalog, else online) and find a clean photo, without holding up the verdict.
        const lookup = lookUpLabel(reading, photo).catch((e: unknown) => ({ ok: false as const, reason: e instanceof LabelReadError ? e.message : 'unexpected error' }));
        // The coach's answer: with the catalog's facts when they come quickly (they usually do), else from the label alone.
        void Promise.race([lookup, new Promise<null>((r) => window.setTimeout(() => r(null), 5000))]).then(async (first) => {
          const f = first && first.ok ? first.lookup : null;
          const out = await coachBottle({
            producer: reading.producer,
            name: reading.wine_name,
            vintage: reading.vintage,
            region: reading.region || f?.region || '',
            country: reading.country || f?.country || '',
            style: f && f.style !== 'unknown' ? f.style : '',
            grapes: f?.grapes.length ? f.grapes : reading.grapes,
            shelfPrice: price,
            typicalPrice: f?.typicalPrice ?? null,
            store: mode === 'shop' ? store.name : '',
            context: shelfContext(wines ?? [], taste),
          }).catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : 'unexpected error' }));
          setLabel((cur) =>
            cur?.photo === photo ? { ...cur, coach: out.ok ? { status: 'done', answer: out.coach } : { status: 'error', reason: out.reason } } : cur,
          );
        });
        lookup.then((outcome) => {
            const found = outcome.ok ? outcome.lookup : null;
            setLabel((cur) =>
              cur?.photo === photo && cur.reading
                ? { ...cur, reading: withLookup(cur.reading, found), lookup: found ? 'done' : 'none', found, failReason: outcome.ok ? undefined : outcome.reason }
                : cur,
            );
            if (found && found.style !== 'unknown') setStyle(found.style);
            if (found?.grapes.length) setQuery((q) => (q === readingToQuery(reading) ? readingToQuery(withLookup(reading, found)) : q));
          });
        setQuery(readingToQuery(reading));
        setBarcode('');
      }}
    />
  );

  // The bottle's answer: what the label says, then how it fits your history.
  const result = (
    <>
      {label && labelUrl && (
        <div className="label-card" aria-live="polite">
          <div className="tile">
            {label.found?.photo ? (
              <img className="bottle" src={label.found.photo.url} alt="Bottle photo" />
            ) : label.lookup === 'pending' || !label.reading ? (
              // Your snap, only while it's being read; it's never kept.
              <img className="bottle" src={labelUrl} alt="" style={{ mixBlendMode: 'normal', opacity: 0.6 }} />
            ) : (
              <BottlePlaceholder />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            {!label.reading ? (
              <p className="muted small" style={{ margin: 0 }}>
                Reading the label…
              </p>
            ) : !label.reading.is_wine_label ? (
              <p className="small" style={{ margin: 0 }}>
                That didn’t look like a wine label. Try again, filling the frame with the front label.
              </p>
            ) : (
              <>
                <div className="eyebrow" style={{ marginBottom: 4 }}>
                  From the label
                </div>
                <div className="label-name">
                  {[label.reading.producer, label.reading.wine_name].filter(Boolean).join(' · ') || 'Name not readable'}
                </div>
                <div className="muted small">
                  {[
                    label.reading.style !== 'unknown' ? STYLES.find((st) => st.value === label.reading!.style)?.label : null,
                    label.reading.vintage,
                    label.reading.region,
                    label.reading.country,
                    label.reading.grapes.join(', '),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {label.lookup === 'pending' && <div className="small muted" style={{ marginTop: 4 }}>Looking this wine up…</div>}
                {label.lookup === 'done' && label.found && (
                  <div className="small" style={{ marginTop: 4, color: 'var(--good)' }}>
                    {label.found.fromCatalog ? (
                      'Found in Palate’s catalog'
                    ) : (
                      <>
                        Confirmed online:{' '}
                        <a href={label.found.sourceUrl} target="_blank" rel="noreferrer">
                          {label.found.sourceName}
                        </a>
                      </>
                    )}
                    {label.found.photo ? ' · photo found' : ''}
                    {!label.found.photo && label.found.photoNote && <div className="muted">{label.found.photoNote} Pick one below, or add it from the web later.</div>}
                    {!label.found.photo && (
                      <PhotoChoices
                        candidates={label.found.candidates}
                        onPick={(c) => setLabel((cur) => (cur?.found ? { ...cur, found: { ...cur.found, photo: c, candidates: [] } } : cur))}
                      />
                    )}
                    {label.found.about && <div style={{ color: 'var(--ink-2)', marginTop: 4 }}>{label.found.about.text}</div>}
                  </div>
                )}
                {label.lookup === 'none' && (
                  <div className="small" style={{ marginTop: 4, color: 'var(--warn)' }}>
                    Couldn’t confirm colour and grapes online ({label.failReason}). Left blank — check the label.
                  </div>
                )}
                {(label.reading.confidence !== 'high' || label.reading.uncertain) && (
                  <div className="small" style={{ color: 'var(--warn)', marginTop: 4 }}>
                    {label.reading.uncertain || 'Some details may be guesses — check the label.'}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {label?.coach && <CoachCard coach={label.coach} />}

      {lookingUp && <div className="status-line">Looking up barcode…</div>}

      {wanted && (
        <Link to={`/wine/${wanted.id}`} className="want-banner" aria-live="polite">
          <Bookmark size={18} />
          <span>
            <strong>On your Want to try list</strong>
            {wanted.suggestion?.reason && <span className="small"> · {cleanReason(wanted.suggestion.reason)}</span>}
          </span>
        </Link>
      )}

      {advice && (
        <div className="advice">
          {!(label?.coach?.status === 'done' && !advice.exact.length && !advice.related.length) && (
          <div className={`verdict ${advice.verdict.level}`} aria-live="polite">
            <span className="eyebrow">Based on your history</span>
            <h2>{advice.verdict.title}</h2>
            <p>{advice.verdict.detail}</p>
          </div>
          )}
          {advice.price?.note && (
            <div className="callout info">
              <Tag size={18} />
              <span>{advice.price.note}</span>
            </div>
          )}

          {advice.exact.length > 0 && (
            <section>
              <h3 className="eyebrow list-title">You’ve had this wine</h3>
              <div className="list">
                {advice.exact.slice(0, 6).map((w) => (
                  <WineRow key={w.id} wine={w} />
                ))}
              </div>
            </section>
          )}

          {advice.related.length > 0 && (
            <section>
              <h3 className="eyebrow list-title">Related wines you’ve had</h3>
              <div className="list">
                {advice.related.slice(0, 6).map((w) => (
                  <WineRow key={w.id} wine={w} />
                ))}
              </div>
            </section>
          )}

          {advice.signals.length > 0 && (
            <section>
              <h3 className="eyebrow list-title">Why</h3>
              <ul className="signals">
                {advice.signals.map((s) => (
                  <li key={`${s.kind}-${s.value}`} className="signal">
                    <div style={{ minWidth: 0 }}>
                      <div className="kind">{s.inferred ? 'Usual grape' : KIND_LABEL[s.kind]}</div>
                      <div className="value">{s.value}</div>
                      <div className="counts">{describeCounts(s.counts)}</div>
                    </div>
                    <Meter s={s} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div>
            <button type="button" className="btn btn-wine" onClick={saveBottle}>
              <Plus size={18} /> Save this bottle
            </button>
          </div>
        </div>
      )}
      {showInput && (
        <>
          <div className="chips" role="group" aria-label="Style">
            {STYLES.map((s) => (
              <button key={s.value} type="button" className="chip" aria-pressed={style === s.value} onClick={() => setStyle(style === s.value ? null : s.value)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="field" style={{ maxWidth: 220 }}>
            <label htmlFor="shelf-price">Shelf price (optional)</label>
            <div className="input-prefix">
              <span>$</span>
              <input id="shelf-price" className="input white" inputMode="decimal" placeholder="0" value={priceText} onChange={(e) => setPriceText(e.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="store-page">
      <div className="store-main">
        <header className="store-intro">
          <div className="eyebrow">In store</div>
          <h1 className="headline store-headline">
            Your sommelier, <br className="mobile-only" />
            <em>{mode === 'shop' ? `at ${store.name}.` : 'at the table.'}</em>
          </h1>
        </header>
        <div className="mobile-only">
          <ModeSwitch />
        </div>
        <div className="mobile-only">
          <StoreChooser />
        </div>
        {labelSnap}
        {snapIdle && (
          <SnapCard
            content={CARD[mode]}
            onCamera={() => (mode === 'shop' ? bottle : snap).current?.camera()}
            onLibrary={() => (mode === 'shop' ? snap.current?.camera() : snap.current?.library())}
          />
        )}
        {label && mode === 'shop' && (
          <section className="check bottle-answer" aria-label="This bottle" ref={resultRef}>
            <div className="answer-head">
              <span className="eyebrow">This bottle</span>
              <button type="button" className="text-link" onClick={clear}>
                Clear
              </button>
            </div>
            {result}
          </section>
        )}
        {mode === 'shop' ? <ShelfSnap key="shop" ref={snap} onIdle={setSnapIdle} /> : <WineListSnap key="restaurant" ref={snap} onIdle={setSnapIdle} budget={tableBudget} />}
        {mode === 'shop' && <StorePicksPanel />}
      </div>

      <aside className="store-side">
        <div className="desktop-only">
          <ModeSwitch />
        </div>
        <div className="side-card desktop-only">
          <StoreChooser variant="list" />
        </div>

        {/* At a restaurant it's the wine list you snap, not one bottle at a time. */}
        {mode === 'shop' && (
          <section className="check" aria-label="Check one bottle" ref={checkRef}>
            <div className="check-head">
              <h2 className="title-lg">Check one bottle</h2>
              <p className="footnote mobile-only">Would I like this? Ask before you buy.</p>
            </div>
            <div className="check-tiles mobile-only">
              <button
                type="button"
                className="tone-tile"
                onClick={() => {
                  setTyping(true);
                  window.setTimeout(() => inputRef.current?.focus(), 0);
                }}
              >
                <Type size={20} strokeWidth={1.6} />
                <span>Type it in</span>
              </button>
              <button type="button" className="tone-tile" onClick={() => setScanning(true)}>
                <Barcode size={20} strokeWidth={1.6} />
                <span>Scan barcode</span>
              </button>
            </div>
            <div className={`check-input search-row${showInput && !label ? ' open' : ''}`}>
              <label className="search">
                <Search size={18} strokeWidth={1.7} />
                <span className="sr-only">Wine on the shelf</span>
                <input
                  ref={inputRef}
                  type="search"
                  enterKeyHint="search"
                  placeholder="Type producer or grape"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                />
                {query && (
                  <button type="button" className="clear" onClick={clear} aria-label="Clear">
                    <X size={18} />
                  </button>
                )}
              </label>
              <button type="button" className="icon-btn lg white" onClick={() => setScanning(true)} aria-label="Scan barcode">
                <Barcode size={20} strokeWidth={1.6} />
              </button>
            </div>

            {!label && result}
          </section>
        )}

        <section className="safe-bets" aria-label="Your safe bets">
          {safeBets.length ? (
            <>
              <div className="mobile-only">
                <ShelfRow title="Your safe bets" sub="Bottles you loved — look for them here">
                  {safeBets.map((w) => (
                    <MiniWineCard key={w.id} wine={w} />
                  ))}
                </ShelfRow>
              </div>
              <div className="desktop-only">
                <div className="eyebrow side-title">Your safe bets</div>
                <div className="safe-list">
                  {safeBets.map((w) => (
                    <Link key={w.id} to={`/wine/${w.id}`} className="safe-row lift">
                      <div className="tile shelf-stage">
                        <BottleImage photo={w.photo} alt="" />
                      </div>
                      <div className="body">
                        <div className="t">{w.name || w.producer || 'Untitled wine'}</div>
                        {w.name && w.producer && <div className="s">{w.producer}</div>}
                      </div>
                      <span className="loved-mark">
                        <Heart size={11} fill="currentColor" strokeWidth={0} /> Loved
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="footnote">Wines you mark “Loved it” show up here as safe bets for quick reference.</p>
          )}
        </section>
      </aside>

      {scanning && <BarcodeScanner onDetected={onDetected} onClose={() => setScanning(false)} />}
    </div>
  );
}
