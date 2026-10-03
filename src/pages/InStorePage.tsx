import { Barcode, Camera, Heart, Plus, ScanLine, Search, Sparkles, Tag, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { LabelSnap } from '../components/LabelSnap';
import { useToast } from '../components/Toast';
import { WineRow } from '../components/WineCard';
import { useDebounced, useWines } from '../hooks';
import { STYLES } from '../lib/constants';
import { formatPrice } from '../lib/format';
import { lookupBarcode } from '../lib/imageSearch';
import { photoFromFile } from '../lib/image';
import { advise, describeCounts, detectStyle, type Signal } from '../lib/insights';
import { readingToDraft, readingToQuery, type LabelReading } from '../lib/labelReader';
import { tokens } from '../lib/text';
import type { WineDraft, WineStyle } from '../types';
import type { AddPrefill } from './WineFormPage';

const KIND_LABEL: Record<Signal['kind'], string> = {
  producer: 'Producer',
  grape: 'Grape',
  region: 'Region',
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

export function InStorePage() {
  const wines = useWines();
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [style, setStyle] = useState<WineStyle | null>(null);
  const [priceText, setPriceText] = useState('');
  const [barcode, setBarcode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [label, setLabel] = useState<{ reading: LabelReading | null; photo: File } | null>(null);
  const labelUrl = useMemo(() => (label ? URL.createObjectURL(label.photo) : null), [label?.photo]);
  useEffect(() => () => void (labelUrl && URL.revokeObjectURL(labelUrl)), [labelUrl]);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = useDebounced(query, 150);
  const price = priceText ? Number(priceText) : null;

  const advice = useMemo(
    () => (wines && (q.trim() || style) ? advise(wines, { query: q, style, price }, formatPrice) : null),
    [wines, q, style, price],
  );

  const safeBets = useMemo(
    () => (wines ?? []).filter((w) => w.rating === 'loved').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
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
      const photo = await photoFromFile(label.photo, { name: 'Your photo' });
      const draft: Partial<WineDraft> = { ...readingToDraft(label.reading), price, barcode, owned: 0, photo };
      if (style) draft.style = style;
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

  return (
    <div className="store-hero">
      <div className="store-layout">
        <div>
          <h1 style={{ margin: 0, fontSize: 30, letterSpacing: '-0.02em' }}>In the store</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Check a bottle against everything you’ve tasted.
          </p>

          <div className="search-row" style={{ paddingTop: 16 }}>
            <label className="search">
              <Search size={20} />
              <span className="sr-only">Wine on the shelf</span>
              <input
                ref={inputRef}
                type="search"
                enterKeyHint="search"
                placeholder="Type producer, grape or region"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  className="clear"
                  onClick={() => {
                    setQuery('');
                    setBarcode('');
                    setLabel(null);
                  }}
                  aria-label="Clear"
                >
                  <X size={18} />
                </button>
              )}
            </label>
            <button type="button" className="icon-btn" style={{ width: 48, height: 48 }} onClick={() => setScanning(true)} aria-label="Scan barcode">
              <Barcode size={20} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
            <LabelSnap
              className="btn btn-dark"
              onStart={(photo) => setLabel({ reading: null, photo })}
              onRead={(reading, photo) => {
                setLabel({ reading, photo });
                if (!reading.is_wine_label) return;
                setQuery(readingToQuery(reading));
                setBarcode('');
                if (reading.style !== 'unknown') setStyle(reading.style);
              }}
            />
          </div>

          {label && labelUrl && (
            <div className="label-card" aria-live="polite">
              <div className="tile">
                <img className="bottle" src={labelUrl} alt="Your label photo" style={{ mixBlendMode: 'normal' }} />
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
                    <div className="section-title" style={{ marginBottom: 4 }}>
                      From the label
                    </div>
                    <div style={{ fontWeight: 700 }}>
                      {[label.reading.producer, label.reading.wine_name].filter(Boolean).join(' · ') || 'Name not readable'}
                    </div>
                    <div className="muted small">
                      {[label.reading.vintage, label.reading.region, label.reading.country, label.reading.grapes.join(', ')].filter(Boolean).join(' · ')}
                    </div>
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

          <div className="chips" role="group" aria-label="Style">
            {STYLES.map((s) => (
              <button key={s.value} type="button" className="chip" aria-pressed={style === s.value} onClick={() => setStyle(style === s.value ? null : s.value)}>
                {s.label}
              </button>
            ))}
          </div>

          <div className="field" style={{ maxWidth: 220, marginTop: 4 }}>
            <label htmlFor="shelf-price">Shelf price (optional)</label>
            <div className="input-prefix">
              <span>$</span>
              <input id="shelf-price" className="input" inputMode="decimal" placeholder="0" value={priceText} onChange={(e) => setPriceText(e.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
          </div>

          {lookingUp && <div className="status-line">Looking up barcode…</div>}

          {advice && (
            <>
              <div className={`verdict ${advice.verdict.level}`} aria-live="polite">
                <span className="eyebrow">Based on your history</span>
                <h2>{advice.verdict.title}</h2>
                <p>{advice.verdict.detail}</p>
              </div>
              {advice.price?.note && (
                <div className="callout info" style={{ marginBottom: 6 }}>
                  <Tag size={18} />
                  <span>{advice.price.note}</span>
                </div>
              )}

              {advice.exact.length > 0 && (
                <section style={{ marginTop: 20 }}>
                  <h3 className="section-title">You’ve had this wine</h3>
                  <div className="list">
                    {advice.exact.slice(0, 6).map((w) => (
                      <WineRow key={w.id} wine={w} />
                    ))}
                  </div>
                </section>
              )}

              {advice.related.length > 0 && (
                <section style={{ marginTop: 20 }}>
                  <h3 className="section-title">Related wines you’ve had</h3>
                  <div className="list">
                    {advice.related.slice(0, 6).map((w) => (
                      <WineRow key={w.id} wine={w} />
                    ))}
                  </div>
                </section>
              )}

              {advice.signals.length > 0 && (
                <section style={{ marginTop: 20 }}>
                  <h3 className="section-title">Why</h3>
                  <ul className="signals">
                    {advice.signals.map((s) => (
                      <li key={`${s.kind}-${s.value}`} className="signal">
                        <div style={{ minWidth: 0 }}>
                          <div className="kind">{KIND_LABEL[s.kind]}</div>
                          <div className="value">{s.value}</div>
                          <div className="counts">{describeCounts(s.counts)}</div>
                        </div>
                        <Meter s={s} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={saveBottle}>
                  <Plus size={18} /> Save this bottle
                </button>
              </div>
            </>
          )}

          {!hasInput && !lookingUp && (
            <div className="tips">
              <div className="tip">
                <Camera size={20} />
                <div>
                  <strong>Snap the label</strong>
                  Claude reads producer, wine, vintage and region from a photo, then Palate checks your history and similar bottles.
                </div>
              </div>
              <div className="tip">
                <ScanLine size={20} />
                <div>
                  <strong>Or type what’s on the label</strong>
                  Producer, grape or region — e.g. “Ridge zinfandel” or “Sancerre”. Palate checks how you rated similar bottles.
                </div>
              </div>
              <button type="button" className="tip" onClick={() => setScanning(true)}>
                <Barcode size={20} />
                <div>
                  <strong>Or scan the barcode</strong>
                  Works on iPhone and Android. Bottles you’ve saved with a barcode open straight away.
                </div>
              </button>
              <div className="tip">
                <Sparkles size={20} />
                <div>
                  <strong>The more you rate, the better it gets</strong>
                  Every “Loved it” and “Wouldn’t buy again” sharpens the advice.
                </div>
              </div>
            </div>
          )}
        </div>

        <aside style={{ marginTop: 28 }}>
          <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Heart size={14} /> Your safe bets
          </h3>
          {safeBets.length ? (
            <div className="list">
              {safeBets.map((w) => (
                <WineRow key={w.id} wine={w} />
              ))}
            </div>
          ) : (
            <p className="muted small">Wines you mark “Loved it” show up here for quick reference.</p>
          )}
        </aside>
      </div>

      {scanning && <BarcodeScanner onDetected={onDetected} onClose={() => setScanning(false)} />}
    </div>
  );
}
