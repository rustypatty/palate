import { AlertTriangle, ArrowLeft, Check, ExternalLink, Link2, Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { isProbablyImageUrl } from '../lib/image';
import { searchOpenFoodFacts, searchWikimediaCommons, webImageSearchUrl, type ImageCandidate } from '../lib/imageSearch';
import { Sheet } from './Sheet';

type SourceId = 'off' | 'commons';

const SOURCES: { id: SourceId; label: string; run: (q: string, s: AbortSignal) => Promise<ImageCandidate[]> }[] = [
  { id: 'off', label: 'Product photos', run: searchOpenFoodFacts },
  { id: 'commons', label: 'Wikimedia Commons', run: searchWikimediaCommons },
];

export interface ExpectedWine {
  producer: string;
  name: string;
  vintage: number | 'NV' | null;
}

export interface ChosenImage {
  url: string;
  sourceName: string;
  pageUrl?: string;
  title?: string;
}

/**
 * Let the user pick a real bottle photo from the web. Nothing is chosen
 * automatically: each candidate shows its product title, and choosing one
 * goes through a side-by-side check against the wine being saved.
 */
export function ImageSearchSheet({
  initialQuery,
  expected,
  onChoose,
  onClose,
}: {
  initialQuery: string;
  expected: ExpectedWine;
  onChoose: (img: ChosenImage) => Promise<void> | void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  const [source, setSource] = useState<SourceId>('off');
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; results: ImageCandidate[]; error?: string }>({
    status: 'idle',
    results: [],
  });
  const [pasted, setPasted] = useState('');
  const [selected, setSelected] = useState<ChosenImage | null>(null);

  useEffect(() => {
    if (!submitted.trim()) {
      setState({ status: 'idle', results: [] });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: 'loading', results: [] });
    SOURCES.find((s) => s.id === source)!
      .run(submitted.trim(), ctrl.signal)
      .then((results) => setState({ status: 'done', results }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ status: 'error', results: [], error: e instanceof Error ? e.message : 'Search failed' });
      });
    return () => ctrl.abort();
  }, [submitted, source]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    setSubmitted(query);
  };

  const onPaste = (e: FormEvent) => {
    e.preventDefault();
    const url = pasted.trim();
    if (!isProbablyImageUrl(url)) return;
    let host = 'Web';
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      /* validated above */
    }
    setSelected({ url, sourceName: host });
  };

  if (selected) {
    return (
      <ConfirmImage
        image={selected}
        expected={expected}
        onBack={() => setSelected(null)}
        onClose={onClose}
        onConfirm={async (img) => {
          await onChoose(img);
          onClose();
        }}
      />
    );
  }

  return (
    <Sheet title="Find a bottle photo" onClose={onClose} wide tall>
      <form onSubmit={onSearch} className="search-row" role="search">
        <label className="search">
          <Search size={20} />
          <span className="sr-only">Search for a bottle photo</span>
          <input type="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Producer, wine, vintage" />
        </label>
        <button type="submit" className="btn btn-dark" style={{ height: 48 }}>
          Search
        </button>
      </form>

      <div className="source-tabs" role="tablist" aria-label="Photo source">
        {SOURCES.map((s) => (
          <button key={s.id} type="button" role="tab" className="chip" aria-selected={source === s.id} aria-pressed={source === s.id} onClick={() => setSource(s.id)}>
            {s.label}
          </button>
        ))}
        <a className="chip" href={webImageSearchUrl(submitted || query)} target="_blank" rel="noreferrer">
          Web images <ExternalLink size={14} />
        </a>
      </div>

      {state.status === 'loading' && <div className="status-line">Searching…</div>}
      {state.status === 'error' && (
        <div className="callout">
          <AlertTriangle size={18} />
          <span>
            Couldn’t reach {SOURCES.find((s) => s.id === source)!.label} ({state.error}). Check your connection, or paste an image link below.
          </span>
        </div>
      )}
      {state.status === 'done' && state.results.length === 0 && (
        <div className="status-line">
          No photos found. Try fewer words (e.g. just producer and wine), another source, or paste a link below.
        </div>
      )}
      {state.results.length > 0 && (
        <>
          <p className="muted small" style={{ margin: '0 0 12px' }}>
            Pick the photo that matches your exact bottle — same producer, cuvée and, ideally, vintage.
          </p>
          <div className="candidates">
            {state.results.map((c) => (
              <button
                key={c.id}
                type="button"
                className="candidate"
                onClick={() => setSelected({ url: c.url, sourceName: c.sourceName, pageUrl: c.pageUrl, title: [c.title, c.subtitle].filter(Boolean).join(' — ') })}
              >
                <div className="tile">
                  <img className="bottle" src={c.thumbUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                </div>
                <div className="title">{c.title}</div>
                <div className="sub">{c.subtitle || c.sourceName}</div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="divider-label">or paste an image link</div>
      <form onSubmit={onPaste} className="url-row">
        <label className="sr-only" htmlFor="img-url">
          Image address
        </label>
        <input
          id="img-url"
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://…/bottle.jpg"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <button type="submit" className="btn btn-outline" style={{ height: 50 }} disabled={!isProbablyImageUrl(pasted)}>
          <Link2 size={18} /> Use
        </button>
      </form>
      <p className="muted small" style={{ marginTop: 8 }}>
        Found it on a producer or shop site? Long-press the photo (or right-click) and choose “Copy image address”, then paste it here.
      </p>
    </Sheet>
  );
}

function ConfirmImage({
  image,
  expected,
  onBack,
  onClose,
  onConfirm,
}: {
  image: ChosenImage;
  expected: ExpectedWine;
  onBack: () => void;
  onClose: () => void;
  onConfirm: (img: ChosenImage) => Promise<void>;
}) {
  const [src, setSrc] = useState(image.url);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [saving, setSaving] = useState(false);
  const fallback = image.url.includes('.full.jpg') ? image.url.replace('.full.jpg', '.400.jpg') : null;

  const expectedLabel = [expected.producer, expected.name].filter(Boolean).join(' ') || 'Not entered yet';
  return (
    <Sheet
      title="Is this your bottle?"
      onClose={onClose}
      wide
      headerAction={
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to results">
          <ArrowLeft size={20} />
        </button>
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Not this one
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={status !== 'ok' || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onConfirm({ ...image, url: src });
              } finally {
                setSaving(false);
              }
            }}
          >
            <Check size={18} /> {saving ? 'Saving…' : 'Use this photo'}
          </button>
        </>
      }
    >
      <div className="confirm">
        <div className="tile" style={{ background: '#fff', border: '1px solid var(--line)' }}>
          {status === 'error' ? (
            <div className="bottle-placeholder" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)' }}>
              This image couldn’t be loaded. Try another one.
            </div>
          ) : (
            <img
              className="bottle"
              style={{ mixBlendMode: 'normal' }}
              src={src}
              alt={image.title ?? 'Selected bottle photo'}
              referrerPolicy="no-referrer"
              onLoad={() => setStatus('ok')}
              onError={() => {
                if (fallback && src !== fallback) setSrc(fallback);
                else setStatus('error');
              }}
            />
          )}
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="compare">
            <div>
              <div className="k">Your wine</div>
              <div className="v">
                {expectedLabel}
                {expected.vintage ? ` ${expected.vintage}` : ''}
              </div>
            </div>
            <div>
              <div className="k">Photo is labeled</div>
              <div className="v">{image.title || 'No description'}</div>
              <div className="muted small">
                {image.sourceName}
                {image.pageUrl && (
                  <>
                    {' · '}
                    <a href={image.pageUrl} target="_blank" rel="noreferrer">
                      View source
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="callout">
            <AlertTriangle size={18} />
            <span>
              Check the label carefully: producer, cuvée name and vintage. A plainer photo of the right bottle beats a beautiful photo of the wrong one.
            </span>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
