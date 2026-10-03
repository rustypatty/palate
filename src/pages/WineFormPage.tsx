import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Stepper, TagInput } from '../components/Inputs';
import { PhotoPicker } from '../components/PhotoPicker';
import { RatingPicker } from '../components/Rating';
import { useToast } from '../components/Toast';
import { createWine, db, emptyDraft, updateWine } from '../db';
import { useWines } from '../hooks';
import { COMMON_COUNTRIES, COMMON_GRAPES, STYLES } from '../lib/constants';
import { tally } from '../lib/filters';
import type { WineDraft } from '../types';

const THIS_YEAR = new Date().getFullYear();

export interface AddPrefill {
  draft?: Partial<WineDraft>;
}

export function WineFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const wines = useWines();
  const prefill = (location.state as AddPrefill | null)?.draft;

  const [draft, setDraft] = useState<WineDraft | null>(editing ? null : { ...emptyDraft(), ...prefill });
  const [vintageText, setVintageText] = useState(prefill?.vintage != null ? String(prefill.vintage) : '');
  const [priceText, setPriceText] = useState(prefill?.price != null ? String(prefill.price) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    db.wines.get(id).then((w) => {
      if (!w) {
        navigate('/', { replace: true });
        return;
      }
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = w;
      setDraft(rest);
      setVintageText(w.vintage !== null ? String(w.vintage) : '');
      setPriceText(w.price !== null ? String(w.price) : '');
    });
  }, [id, navigate]);

  const suggestions = useMemo(() => {
    const all = wines ?? [];
    const merge = (mine: string[], common: string[]) => {
      const seen = new Set(mine.map((s) => s.toLowerCase()));
      return [...mine, ...common.filter((c) => !seen.has(c.toLowerCase()))];
    };
    return {
      countries: merge(tally(all.map((w) => w.country)).map((t) => t.value), COMMON_COUNTRIES),
      regions: tally(all.map((w) => w.region)).map((t) => t.value),
      grapes: merge(tally(all.flatMap((w) => w.grapes)).map((t) => t.value), COMMON_GRAPES),
      producers: tally(all.map((w) => w.producer)).map((t) => t.value),
      stores: tally(all.map((w) => w.store)).map((t) => t.value),
    };
  }, [wines]);

  if (!draft) return null;

  const set = (patch: Partial<WineDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const nv = vintageText === 'NV';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const producer = draft.producer.trim();
    const name = draft.name.trim();
    if (!producer && !name) {
      setError('Add a producer or wine name so you can find it later.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const v = vintageText.trim();
    const vintage = v === 'NV' ? 'NV' : v ? Number(v) : null;
    if (typeof vintage === 'number' && (!Number.isInteger(vintage) || vintage < 1800 || vintage > THIS_YEAR + 1)) {
      setError(`Vintage should be a year between 1800 and ${THIS_YEAR + 1}, or NV.`);
      return;
    }
    const p = priceText.trim().replace(/[^0-9.]/g, '');
    const price = p ? Number(p) : null;
    if (price !== null && (isNaN(price) || price < 0)) {
      setError('Price should be a number.');
      return;
    }
    const clean: WineDraft = {
      ...draft,
      producer,
      name,
      vintage,
      price,
      country: draft.country.trim(),
      region: draft.region.trim(),
      store: draft.store.trim(),
      notes: draft.notes.trim(),
      barcode: draft.barcode.trim(),
    };
    setSaving(true);
    try {
      if (id) {
        await updateWine(id, clean);
        toast('Changes saved');
        navigate(`/wine/${id}`, { replace: true });
      } else {
        const newId = await createWine(clean);
        toast('Added to your wines');
        navigate(`/wine/${newId}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save. Try again.');
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="page-head" style={{ paddingBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: 24 }}>{editing ? 'Edit wine' : 'Add a wine'}</h1>
        </div>
      </div>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      <PhotoPicker
        photo={draft.photo}
        onChange={(photo) => set({ photo })}
        expected={{ producer: draft.producer, name: draft.name, vintage: draft.vintage }}
      />

      <div className="field">
        <label htmlFor="producer">Producer</label>
        <input
          id="producer"
          className="input"
          list="producer-list"
          value={draft.producer}
          onChange={(e) => set({ producer: e.target.value })}
          placeholder="e.g. Ridge Vineyards"
          autoComplete="off"
          autoCapitalize="words"
        />
        <datalist id="producer-list">
          {suggestions.producers.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div className="field">
        <label htmlFor="name">Wine / cuvée</label>
        <input
          id="name"
          className="input"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Lytton Springs"
          autoComplete="off"
          autoCapitalize="words"
        />
      </div>

      <div className="two-col">
        <div className="field">
          <label htmlFor="vintage">Vintage</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="vintage"
              className="input"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder={String(THIS_YEAR - 3)}
              value={nv ? '' : vintageText}
              disabled={nv}
              onChange={(e) => {
                const t = e.target.value.replace(/\D/g, '').slice(0, 4);
                setVintageText(t);
                set({ vintage: t.length === 4 ? Number(t) : null });
              }}
            />
            <button
              type="button"
              className="chip"
              style={{ height: 50 }}
              aria-pressed={nv}
              onClick={() => {
                setVintageText(nv ? '' : 'NV');
                set({ vintage: nv ? null : 'NV' });
              }}
            >
              NV
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="price">Price</label>
          <div className="input-prefix">
            <span>$</span>
            <input
              id="price"
              className="input"
              inputMode="decimal"
              placeholder="0"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>
        </div>
      </div>

      <div className="field">
        <span className="label">How was it?</span>
        <RatingPicker value={draft.rating} onChange={(rating) => set({ rating })} />
      </div>

      <div className="field">
        <span className="label">Style</span>
        <div className="chip-group" role="group" aria-label="Style">
          {STYLES.map((s) => (
            <button key={s.value} type="button" className="chip" aria-pressed={draft.style === s.value} onClick={() => set({ style: draft.style === s.value ? null : s.value })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="row-between">
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Bottles in my cellar</div>
          <div className="muted small">How many you have on hand right now</div>
        </div>
        <Stepper value={draft.owned} onChange={(owned) => set({ owned })} label="bottles owned" />
      </div>

      <div className="two-col">
        <div className="field">
          <label htmlFor="country">Country</label>
          <input id="country" className="input" list="country-list" value={draft.country} onChange={(e) => set({ country: e.target.value })} autoComplete="off" placeholder="e.g. France" />
          <datalist id="country-list">
            {suggestions.countries.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="region">Region</label>
          <input id="region" className="input" list="region-list" value={draft.region} onChange={(e) => set({ region: e.target.value })} autoComplete="off" placeholder="e.g. Rhône" />
          <datalist id="region-list">
            {suggestions.regions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="field">
        <label htmlFor="grapes">Grapes</label>
        <TagInput id="grapes" value={draft.grapes} onChange={(grapes) => set({ grapes })} suggestions={suggestions.grapes} placeholder="Type a grape and press Enter" />
      </div>

      <div className="field">
        <label htmlFor="notes">Tasting notes</label>
        <textarea
          id="notes"
          className="textarea"
          value={draft.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="What did you taste? What did you eat with it? Would you serve it to friends?"
        />
      </div>

      <div className="two-col">
        <div className="field">
          <label htmlFor="tasted">Tasted on</label>
          <input id="tasted" className="input" type="date" value={draft.tastedOn ?? ''} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ tastedOn: e.target.value || null })} />
        </div>
        <div className="field">
          <label htmlFor="store">Bought at</label>
          <input id="store" className="input" list="store-list" value={draft.store} onChange={(e) => set({ store: e.target.value })} autoComplete="off" placeholder="Shop or restaurant" />
          <datalist id="store-list">
            {suggestions.stores.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="field">
        <label htmlFor="barcode">Barcode</label>
        <input id="barcode" className="input" inputMode="numeric" value={draft.barcode} onChange={(e) => set({ barcode: e.target.value.replace(/\s/g, '') })} placeholder="Optional — lets you scan it in the store" />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save wine'}
        </button>
      </div>
    </form>
  );
}
