import { Download, HardDrive, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../components/Toast';
import { useWines } from '../hooks';
import { downloadBlob, exportBackup, importBackup } from '../lib/backup';
import { STYLE_LABEL } from '../lib/constants';
import { tally } from '../lib/filters';
import { formatPrice } from '../lib/format';
import type { Wine } from '../types';

function Bars({ title, rows, empty }: { title: string; rows: { value: string; count: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <div className="bars">
          {rows.slice(0, 6).map((r) => (
            <div key={r.value} className="bar-row">
              <span className="name">{r.value}</span>
              <span className="muted">{r.count}</span>
              <span className="track">
                <i style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function ProfilePage() {
  const wines = useWines();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage !== undefined && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB`))
      .catch(() => {});
  }, [wines?.length]);

  const stats = useMemo(() => {
    const all: Wine[] = wines ?? [];
    const loved = all.filter((w) => w.rating === 'loved');
    return {
      total: all.length,
      loved: loved.length,
      owned: all.reduce((n, w) => n + w.owned, 0),
      tasted: all.filter((w) => w.rating !== null).length,
      grapes: tally(loved.flatMap((w) => w.grapes)),
      countries: tally(loved.map((w) => w.country)),
      regions: tally(loved.map((w) => w.region)),
      styles: tally(loved.map((w) => (w.style ? STYLE_LABEL[w.style] : ''))),
      lovedPrice: median(loved.flatMap((w) => (w.price !== null ? [w.price] : []))),
      passes: tally(all.filter((w) => w.rating === 'wouldnt').flatMap((w) => w.grapes)),
    };
  }, [wines]);

  if (wines === undefined) return null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>My palate</h1>
          <p className="sub">What your ratings say about what you like.</p>
        </div>
      </div>

      <div className="stats" style={{ marginTop: 8 }}>
        <div className="stat">
          <div className="n">{stats.total}</div>
          <div className="l">Wines</div>
        </div>
        <div className="stat">
          <div className="n">{stats.loved}</div>
          <div className="l">Loved</div>
        </div>
        <div className="stat">
          <div className="n">{stats.owned}</div>
          <div className="l">Bottles on hand</div>
        </div>
        <div className="stat">
          <div className="n">{stats.lovedPrice !== null ? formatPrice(Math.round(stats.lovedPrice)) : '—'}</div>
          <div className="l">Typical price of a loved wine</div>
        </div>
      </div>

      <div className="profile-grid">
        <Bars title="Grapes you love" rows={stats.grapes} empty="Rate a few wines “Loved it” to see patterns." />
        <Bars title="Countries you love" rows={stats.countries} empty="Add countries to wines you love." />
        <Bars title="Regions you love" rows={stats.regions} empty="Add regions to wines you love." />
        <Bars title="Grapes you’d skip" rows={stats.passes} empty="Nothing you’d avoid yet." />
      </div>

      <div className="profile-grid">
        <section className="card-box">
          <h2 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <HardDrive size={14} /> Your data
          </h2>
          <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
            Your wines and photos are stored privately on this device{usage ? ` (${usage})` : ''}. Export a backup now and then, and use it to move
            your collection to another phone or computer.
          </p>
          {persisted === false && (
            <p className="small muted" style={{ margin: 0 }}>
              Tip: add Palate to your home screen so your browser keeps the data safe long-term.
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-dark"
              disabled={!wines.length}
              onClick={async () => {
                const blob = await exportBackup();
                downloadBlob(blob, `palate-backup-${new Date().toISOString().slice(0, 10)}.json`);
              }}
            >
              <Download size={18} /> Export backup
            </button>
            <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()}>
              <Upload size={18} /> Restore backup
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const r = await importBackup(f);
                toast(`Restored ${r.wines} ${r.wines === 1 ? 'wine' : 'wines'}`);
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Couldn’t restore that file');
              }
            }}
          />
        </section>
      </div>
    </div>
  );
}
