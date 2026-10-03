import { useMemo, useState } from 'react';
import { PRICE_BANDS, STYLES } from '../lib/constants';
import { applyFilters, DEFAULT_FILTERS, tally, type Filters, type SortKey } from '../lib/filters';
import type { Wine, WineStyle } from '../types';
import { Sheet } from './Sheet';

export const SORTS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Recently updated' },
  { value: 'rating', label: 'Best rated' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'vintage', label: 'Vintage: newest' },
  { value: 'producer', label: 'Producer A–Z' },
];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FilterSheet({
  wines,
  filters,
  onApply,
  onClose,
}: {
  wines: Wine[];
  filters: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters);
  const countries = useMemo(() => tally(wines.map((w) => w.country)), [wines]);
  const styleCounts = useMemo(() => tally(wines.map((w) => w.style ?? '')), [wines]);
  const resultCount = applyFilters(wines, draft).length;

  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Sheet
      title="Filter & sort"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => set({ countries: [], styles: [], priceBands: [], sort: DEFAULT_FILTERS.sort })}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Show {resultCount} {resultCount === 1 ? 'wine' : 'wines'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 24 }}>
        <section>
          <h3 className="section-title">Country</h3>
          {countries.length === 0 ? (
            <p className="muted small">Add a country to a wine to filter by it.</p>
          ) : (
            <div className="chip-group">
              {countries.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="chip"
                  aria-pressed={draft.countries.includes(c.value)}
                  onClick={() => set({ countries: toggle(draft.countries, c.value) })}
                >
                  {c.value} <span className="count">{c.count}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="section-title">Style</h3>
          <div className="chip-group">
            {STYLES.map((s) => {
              const n = styleCounts.find((c) => c.value === s.value)?.count ?? 0;
              return (
                <button
                  key={s.value}
                  type="button"
                  className="chip"
                  aria-pressed={draft.styles.includes(s.value)}
                  onClick={() => set({ styles: toggle<WineStyle>(draft.styles, s.value) })}
                >
                  {s.label} <span className="count">{n}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="section-title">Price per bottle</h3>
          <div className="chip-group">
            {PRICE_BANDS.map((b) => (
              <button
                key={b.id}
                type="button"
                className="chip"
                aria-pressed={draft.priceBands.includes(b.id)}
                onClick={() => set({ priceBands: toggle(draft.priceBands, b.id) })}
              >
                {b.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="section-title">Sort by</h3>
          <div className="chip-group">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                className="chip"
                aria-pressed={draft.sort === s.value}
                onClick={() => set({ sort: s.value })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </Sheet>
  );
}
