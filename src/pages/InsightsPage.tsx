import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ActivityChart } from '../components/insights/ActivityChart';
import { useWines } from '../hooks';
import { STYLES } from '../lib/constants';
import {
  buildDashboard,
  countryOptions,
  EMPTY_FILTER,
  MIN,
  PRICE_STEPS,
  RANGES,
  type Dashboard,
  type DashboardFilter,
  type RangeId,
  type RateRow,
} from '../lib/dashboard';
import { formatPrice } from '../lib/format';
import type { WineStyle } from '../types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** "▼ 57% added vs prior week · 13 last week". */
function changeNote(change: number | null, last: number, verb: string): string {
  if (change === null) return `${last} ${verb} last week`;
  if (Math.round(change * 100) === 0) return `Same as the week before · ${last} ${verb}`;
  return `${change > 0 ? '▲' : '▼'} ${Math.abs(Math.round(change * 100))}% vs prior week · ${last} ${verb}`;
}

function Meter({ parts, label, tall }: { parts: { share: number; muted?: boolean }[]; label: string; tall?: boolean }) {
  return (
    <div className={`ins-meter${tall ? ' tall' : ''}`} role="img" aria-label={label}>
      {parts.map((p, i) => (p.share > 0 ? <i key={i} className={p.muted ? 'muted' : undefined} style={{ width: `${p.share * 100}%` }} /> : null))}
    </div>
  );
}

function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const w = 116;
  const h = 28;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [2 + (i * (w - 4)) / (values.length - 1), h - 2 - (v / max) * (h - 6)] as const);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="ins-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} />
      <circle cx={lx} cy={ly} r={4} />
    </svg>
  );
}

function Pending({ title, text, have, need }: { title: string; text: string; have?: number; need?: number }) {
  return (
    <>
      <h2 className="ins-ct">{title}</h2>
      <p className="ins-cs">{text}</p>
      {have !== undefined && need !== undefined && (
        <div className="ins-pending">
          <Meter parts={[{ share: Math.min(1, have / need) }]} label={`${have} of ${need}`} />
          <span className="ins-cs">{have} of {need}</span>
        </div>
      )}
    </>
  );
}

function RateTrack({ rate, avg, strong }: { rate: number; avg: number | null; strong: boolean }) {
  return (
    <div className="ins-rtrack">
      <div className="ins-rfill" style={{ width: `${rate * 100}%`, background: strong ? 'var(--ins-a)' : 'var(--ins-gray)' }} />
      {avg !== null && <i className="ins-avg" style={{ left: `${avg * 100}%` }} />}
    </div>
  );
}

function GrapeTable({ rows, avg, pending }: { rows: RateRow[]; avg: number | null; pending: number }) {
  return (
    <>
      <div className="ins-card-head">
        <div>
          <h2 className="ins-ct">Loved rate by grape</h2>
          <p className="ins-cs">Share of rated wines you marked Loved it</p>
        </div>
        {avg !== null && (
          <div className="ins-legend">
            <span><i className="ins-key sq" />Above your {pct(avg)} average</span>
            <span><i className="ins-key sq gray" />Below</span>
          </div>
        )}
      </div>
      <div className="ins-scroll">
        <table className="ins-table grapes">
          <thead>
            <tr>
              <th>Grape</th>
              <th className="hide-s">Wines</th>
              <th>Rated</th>
              <th className="hide-s">Loved</th>
              <th className="rate-h" aria-sort="descending">Loved rate ▾</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="hide-s">{r.wines}</td>
                <td>{r.rated}</td>
                <td className="hide-s">{r.loved}</td>
                <td>
                  <div className="ins-rate">
                    <RateTrack rate={r.rate} avg={avg} strong={avg === null || r.rate >= avg} />
                    <span className="ins-pct">{pct(r.rate)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ins-cs">
        A grape appears once you’ve rated {MIN.grapeRated} wines of it
        {pending > 0 ? ` (${pending} more ${pending === 1 ? 'is' : 'are'} on the way)` : ''}.
        {avg !== null && ` The thin line marks your overall ${pct(avg)}.`}
      </p>
    </>
  );
}

function Columns({ half, cols }: { half?: boolean; cols: { key: string; label: ReactNode; sub?: string; height: number; strong: boolean; tip: string; aria: string }[] }) {
  return (
    <>
      <div className="ins-cols">
        {half && <i className="ins-half" />}
        {cols.map((c) => (
          <div key={c.key} className="ins-col" tabIndex={0} aria-label={c.aria}>
            <span className="tip">{c.tip}</span>
            <span className="bar" style={{ height: c.height, background: c.strong ? 'var(--ins-a)' : 'var(--ins-gray)' }} />
          </div>
        ))}
      </div>
      <div className="ins-col-labels ins-cs">
        {cols.map((c) => (
          <span key={c.key}>
            {c.label}
            {c.sub && <><br />{c.sub}</>}
          </span>
        ))}
      </div>
    </>
  );
}

function WeekdayCard({ d }: { d: Dashboard }) {
  if (!d.weekdays) {
    return <Pending title="When you taste" text={`Add a tasting date to ${MIN.weekdayTastings} wines and the days you drink most will show here.`} have={d.kpis.tasted} need={MIN.weekdayTastings} />;
  }
  const { counts, total, top } = d.weekdays;
  const max = Math.max(...counts);
  const H = 120;
  return (
    <>
      <div>
        <h2 className="ins-ct">When you taste</h2>
        <p className="ins-cs">Tastings by day of the week</p>
      </div>
      <div className="ins-cols days">
        {counts.map((n, k) => (
          <div key={k} className="ins-col" tabIndex={0} aria-label={`${DAYS[k]}: ${n} ${n === 1 ? 'tasting' : 'tastings'}`}>
            {k === top ? <b className="top-n">{n}</b> : <span className="tip">{DAYS[k].slice(0, 3)} · {n}</span>}
            <span className="bar" style={{ height: n ? Math.max(4, (n / max) * H) : 0, background: k === top ? 'var(--ins-a)' : 'var(--ins-gray)' }} />
            <span className="ins-cs day">{DAYS[k].slice(0, 2)}</span>
          </div>
        ))}
      </div>
      <p className="ins-cs">
        {DAYS[top]}: {counts[top]} of {total} tastings ({pct(counts[top] / total)}).
      </p>
    </>
  );
}

function CountryCard({ d }: { d: Dashboard }) {
  const avg = d.kpis.lovedRate;
  return (
    <>
      <div>
        <h2 className="ins-ct">Loved rate by country</h2>
        <p className="ins-cs">Rated wines only</p>
      </div>
      <div className="ins-bars">
        {d.countries.slice(0, 6).map((c) => (
          <div key={c.key} className="ins-bar-row" tabIndex={0} aria-label={`${c.label}: ${pct(c.rate)} loved, ${c.loved} of ${c.rated} rated`}>
            <span className="name">{c.label}</span>
            <RateTrack rate={c.rate} avg={avg} strong={c.rated >= MIN.smallSample && (avg === null || c.rate >= avg)} />
            <span className="ins-pct">{pct(c.rate)}</span>
            <span className="ins-cs n">{c.loved}/{c.rated}</span>
          </div>
        ))}
      </div>
      {d.countries.some((c) => c.rated < MIN.smallSample) && (
        <p className="ins-cs">Grey bars have under {MIN.smallSample} ratings: early reads. A country is listed from {MIN.countryRated} ratings.</p>
      )}
    </>
  );
}

function PriceCard({ d }: { d: Dashboard }) {
  const H = 120;
  const shown = d.prices.filter((p) => p.rated >= MIN.band);
  const best = shown.length ? Math.max(...shown.map((p) => p.rate)) : 0;
  return (
    <>
      <div>
        <h2 className="ins-ct">Loved rate by price paid</h2>
        <p className="ins-cs">Rated wines with a price ({d.pricedRated} of {d.kpis.rated})</p>
      </div>
      <div>
        <Columns
          half
          cols={d.prices.map((p, k) => ({
            key: PRICE_STEPS[k].id,
            label: p.label,
            sub: `n=${p.rated}`,
            height: p.rated >= MIN.band ? Math.max(3, p.rate * H) : 0,
            strong: p.rated >= MIN.band && p.rate === best,
            tip: p.rated ? `${pct(p.rate)} · ${p.loved} of ${p.rated}` : 'No ratings yet',
            aria: p.rated ? `${p.label}: ${pct(p.rate)} loved, ${p.loved} of ${p.rated}` : `${p.label}: no rated wines`,
          }))}
        />
      </div>
      <p className="ins-cs">Gridline at 50%. A band needs {MIN.band} rated wines to be drawn.</p>
    </>
  );
}

function DrinkCard({ d }: { d: Dashboard }) {
  const { onHand, ready, soon, early, past, none } = d.drink;
  const known = onHand - none;
  const readyNow = ready + soon;
  return (
    <>
      <div>
        <h2 className="ins-ct">Drink window</h2>
        <p className="ins-cs">{onHand} {onHand === 1 ? 'bottle' : 'bottles'} on hand</p>
      </div>
      {known > 0 ? (
        <>
          <Meter
            tall
            label={`${readyNow} ready now, ${early} worth holding${past ? `, ${past} past their best` : ''}`}
            parts={[{ share: readyNow / known }, { share: early / known, muted: true }, { share: past / known, muted: true }]}
          />
          <div className="ins-legend">
            <span><i className="ins-key sq" />Ready now · {readyNow}</span>
            <span><i className="ins-key sq gray" />Worth holding · {early}</span>
            {past > 0 && <span><i className="ins-key sq gray" />Past their best · {past}</span>}
          </div>
          <p className="ins-cs">
            {soon > 0 && `${soon} ${soon === 1 ? 'is' : 'are'} in the last year of ${soon === 1 ? 'its' : 'their'} window. `}
            {none > 0 ? `${none} ${none === 1 ? 'bottle has' : 'bottles have'} no window yet.` : past === 0 ? 'None are past their best.' : ''}
          </p>
        </>
      ) : (
        <p className="ins-cs">Palate works out a drink window for each bottle you own. They’ll show here as they arrive.</p>
      )}
    </>
  );
}

function CoverageCard({ d }: { d: Dashboard }) {
  const verb = { rating: 'Rate', tasted: 'Date', price: 'Add prices to' } as const;
  return (
    <>
      <div>
        <h2 className="ins-ct">Data coverage</h2>
        <p className="ins-cs">Each chart uses only the wines that have the field. Filling gaps sharpens them.</p>
      </div>
      <div className="ins-cov">
        {d.coverage.map((c) => {
          const missing = c.total - c.have;
          return (
            <div key={c.id} className="ins-cov-row">
              <span className="name">{c.label}</span>
              <Meter parts={[{ share: c.total ? c.have / c.total : 0 }]} label={`${c.have} of ${c.total} wines`} />
              <span className="ins-cs n">{c.have} of {c.total}</span>
              {missing > 0 ? (
                <Link to="/" className="ins-mini">{verb[c.id]} {missing} {missing === 1 ? 'wine' : 'wines'}</Link>
              ) : (
                <span className="ins-cs done">Complete</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Filters({ filter, onChange, countries }: { filter: DashboardFilter; onChange: (f: DashboardFilter) => void; countries: string[] }) {
  return (
    <div className="ins-filters">
      <label className="ins-fl">
        Range
        <select aria-label="Date range" value={filter.range} onChange={(e) => onChange({ ...filter, range: e.target.value as RangeId })}>
          {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </label>
      <label className="ins-fl">
        Style
        <select aria-label="Style" value={filter.style} onChange={(e) => onChange({ ...filter, style: e.target.value as WineStyle | 'all' })}>
          <option value="all">All</option>
          {STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <label className="ins-fl">
        Country
        <select aria-label="Country" value={filter.country} onChange={(e) => onChange({ ...filter, country: e.target.value })}>
          <option value="all">All</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
    </div>
  );
}

export function InsightsPage() {
  const wines = useWines();
  const [filter, setFilter] = useState<DashboardFilter>(EMPTY_FILTER);
  const countries = useMemo(() => (wines ? countryOptions(wines) : []), [wines]);
  const d = useMemo(() => (wines ? buildDashboard(wines, filter) : null), [wines, filter]);
  if (!wines || !d) return null;

  const k = d.kpis;
  const filtered = filter.style !== 'all' || filter.country !== 'all' || filter.range !== 'all';

  if (wines.length === 0) {
    return (
      <div className="ins-page">
        <h1 className="ins-h1">Insights</h1>
        <div className="ins-card">
          <Pending title="Nothing to show yet" text="Add a few wines, rate them and note when you tasted them. This page fills in as you go." />
          <Link to="/add" className="btn btn-wine" style={{ justifySelf: 'start' }}>Add a wine</Link>
        </div>
      </div>
    );
  }

  const addedSeries = d.weeks.map((w) => w.added);
  const tastedSeries = d.weeks.map((w) => w.tasted);

  return (
    <div className="ins-page">
      <div className="ins-top">
        <div>
          <h1 className="ins-h1">Insights</h1>
          <p className="ins-cs" style={{ marginTop: 6 }}>
            Your collection in numbers · {d.count} {d.count === 1 ? 'wine' : 'wines'}
            {filtered && d.count !== wines.length ? ` of ${wines.length}` : ''}
          </p>
        </div>
        <Filters filter={filter} onChange={setFilter} countries={countries} />
      </div>

      {d.count === 0 ? (
        <div className="ins-card">
          <Pending title="No wines match" text="Nothing fits these filters. Try a longer range, or set Style and Country back to All." />
        </div>
      ) : (
        <>
          <section className="ins-kpis" aria-label="Key numbers">
            <div className="ins-card ins-kpi">
              <span className="ins-lbl">Wines</span>
              <div className="ins-kpi-row">
                <span className="ins-val">{k.wines}</span>
                <Spark values={addedSeries} label="Wines added per week" />
              </div>
              <span className="ins-dl">{d.weeks.length ? changeNote(d.change.added, d.change.addedLast, 'added') : 'In this range'}</span>
            </div>
            <div className="ins-card ins-kpi">
              <span className="ins-lbl">Tasted</span>
              <div className="ins-kpi-row">
                <span className="ins-val">{k.tasted}</span>
                <Spark values={tastedSeries} label="Wines tasted per week" />
              </div>
              <span className="ins-dl">{d.weeks.length ? changeNote(d.change.tasted, d.change.tastedLast, 'tasted') : `${pct(k.wines ? k.tasted / k.wines : 0)} of your wines`}</span>
            </div>
            <div className="ins-card ins-kpi">
              <span className="ins-lbl">Rated</span>
              <span className="ins-val">{k.rated}</span>
              <Meter parts={[{ share: k.wines ? k.rated / k.wines : 0 }]} label={`${k.rated} of ${k.wines} wines rated`} />
              <span className="ins-dl">{pct(k.wines ? k.rated / k.wines : 0)} of your wines</span>
            </div>
            <div className="ins-card ins-kpi">
              <span className="ins-lbl">Loved rate</span>
              <span className="ins-val">{k.lovedRate === null ? '–' : pct(k.lovedRate)}</span>
              <Meter parts={[{ share: k.lovedRate ?? 0 }]} label={`${k.loved} of ${k.rated} rated wines loved`} />
              <span className="ins-dl">{k.rated ? `${k.loved} of ${k.rated} rated wines` : 'Rate a wine to see this'}</span>
            </div>
            <div className="ins-card ins-kpi">
              <span className="ins-lbl">Bottles on hand</span>
              <span className="ins-val">{k.bottles}</span>
              {d.drink.onHand - d.drink.none > 0 ? (
                <>
                  <Meter
                    parts={[{ share: (d.drink.ready + d.drink.soon) / (d.drink.onHand - d.drink.none) }, { share: (d.drink.early + d.drink.past) / (d.drink.onHand - d.drink.none), muted: true }]}
                    label={`${d.drink.ready + d.drink.soon} ready, ${d.drink.early + d.drink.past} not`}
                  />
                  <span className="ins-dl">{d.drink.ready + d.drink.soon} ready · {d.drink.early} hold</span>
                </>
              ) : (
                <span className="ins-dl">None with a drink window yet</span>
              )}
            </div>
            <div className="ins-card ins-kpi">
              <span className="ins-lbl">Median paid</span>
              <span className="ins-val">{k.medianPaid === null ? '–' : formatPrice(k.medianPaid)}</span>
              <Meter parts={[{ share: k.wines ? k.priced / k.wines : 0 }]} label={`${k.priced} of ${k.wines} wines have a price`} />
              <span className="ins-dl">per bottle · {k.priced} of {k.wines} priced</span>
            </div>
          </section>

          {d.highlights.length > 0 && (
            <section className="ins-card" aria-label="What stands out">
              <h2 className="ins-ct">What stands out</h2>
              <div className="ins-stand">
                {d.highlights.map((h) => (
                  <p key={h.id}>
                    {h.parts.map((p, i) => (p.b ? <b key={i}>{p.t}</b> : <span key={i}>{p.t}</span>))}
                  </p>
                ))}
              </div>
            </section>
          )}

          <div className="ins-row">
            <section className="ins-card ins-grow2" aria-label="Weekly activity">
              {d.weeks.length ? (
                <>
                  <ActivityChart weeks={d.weeks} />
                  {d.peak && (
                    <p className="ins-cs">
                      The week of {d.peak.label} holds {d.peak.tasted} tastings, {pct(d.peak.share)} of everything logged in this range.
                    </p>
                  )}
                </>
              ) : (
                <Pending title="Weekly activity" text={`This chart draws once there are ${MIN.weeks} weeks of activity in range.`} />
              )}
            </section>
            <section className="ins-card ins-grow1" aria-label="Tastings by weekday">
              <WeekdayCard d={d} />
            </section>
          </div>

          <div className="ins-row">
            <section className="ins-card ins-grow3" aria-label="Loved rate by grape">
              {d.grapes.length ? (
                <GrapeTable rows={d.grapes} avg={k.lovedRate} pending={d.grapesPending} />
              ) : (
                <Pending
                  title="Loved rate by grape"
                  text={`A grape shows up here once you’ve rated ${MIN.grapeRated} wines of it.`}
                  have={d.grapeMostRated}
                  need={MIN.grapeRated}
                />
              )}
            </section>
            <div className="ins-col-stack">
              <section className="ins-card" aria-label="Loved rate by country">
                {d.countries.length ? <CountryCard d={d} /> : <Pending title="Loved rate by country" text="Rate a wine and its country will show up here." />}
              </section>
              <section className="ins-card" aria-label="Loved rate by price">
                {d.pricedRated >= MIN.priceRated && d.prices.some((p) => p.rated >= MIN.band) ? (
                  <PriceCard d={d} />
                ) : (
                  <Pending
                    title="Loved rate by price paid"
                    text={`Rate and price ${MIN.priceRated} wines to see which prices you love at.`}
                    have={d.pricedRated}
                    need={MIN.priceRated}
                  />
                )}
              </section>
            </div>
          </div>

          <div className="ins-row">
            <section className="ins-card ins-grow1" aria-label="Drink window">
              <DrinkCard d={d} />
            </section>
            <section className="ins-card ins-grow2" aria-label="Data coverage">
              <CoverageCard d={d} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
