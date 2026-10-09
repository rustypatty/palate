import { ChevronRight, Download, Minus, Plus, Upload } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CloudSync, cloudSummary, useCloudStatus } from '../components/CloudSync';
import { TasteHeader, TasteQuote } from '../components/TasteCard';
import { ProfileImport, ProfileSummary, useProfile } from '../components/ProfileImport';
import { useToast } from '../components/Toast';
import { BellIcon } from '../components/PriceWatch';
import { useAllWines, useWines } from '../hooks';
import { downloadBlob, exportBackup, importBackup } from '../lib/backup';
import { STYLE_LABEL } from '../lib/constants';
import { tally } from '../lib/filters';
import { formatPrice } from '../lib/format';
import { apiKeyProblem, getDeviceKey, normalizeApiKey, setApiKey, testApiKey } from '../lib/labelReader';
import { saveAccountSetting } from '../lib/cloud';
import { useServerKey } from '../lib/serverKey';
import { favouriteRed, profileFavourites } from '../lib/profile';
import { buildTaste } from '../lib/taste';
import { lastCheckedAt, priceDrops, watchedWines } from '../lib/priceWatch';
import { usePriceAuto, usePriceCheckedAt } from '../lib/usePicks';
import { ago } from '../components/StorePicks';
import type { Wine } from '../types';

function LabelReadingSettings({ onFocusRequest, onChange }: { onFocusRequest: () => void; onChange: () => void }) {
  const location = useLocation();
  const focusKey = (location.state as { focusKey?: number } | null)?.focusKey;
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLElement>(null);
  const [saved, setSaved] = useState(getDeviceKey);
  const onServer = useServerKey();
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'busy'; text: string } | null>(null);

  useEffect(() => {
    if (!focusKey) return;
    onFocusRequest();
    window.setTimeout(() => {
      boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inputRef.current?.focus({ preventScroll: true });
    }, 50);
  }, [focusKey]);

  const save = async () => {
    const key = normalizeApiKey(draft);
    if (!key) return;
    const problem = apiKeyProblem(key);
    if (problem) {
      setStatus({ kind: 'error', text: problem });
      return;
    }
    setStatus({ kind: 'busy', text: 'Checking key…' });
    const result = await testApiKey(key);
    if (result === true) {
      setApiKey(key);
      setSaved(key);
      onChange();
      setDraft('');
      setStatus({ kind: 'ok', text: 'Key works. You can snap labels now.' });
    } else {
      setStatus({ kind: 'error', text: result });
    }
  };

  return (
    <section className="fold-content" ref={boxRef}>
      <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
        Anything Claude does uses your own API key, billed to your Anthropic account. Create one at{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          console.anthropic.com
        </a>
        .
      </p>
      <ul className="small cost-list">
        <li>
          <strong>Free:</strong> your collection, history and advice, barcode scans, and looking a snapped bottle up in Palate’s wine catalog (photo,
          colour, grapes, region).
        </li>
        <li>
          <strong>About 2¢:</strong> reading a bottle’s label. In a shop, the coach’s full answer about that bottle adds about 3¢. A written description on a wine’s page is about 3¢, once per wine.
        </li>
        <li>
          <strong>About 10–30¢:</strong> searching the web — only when the catalog doesn’t know a bottle, or when you ask for a photo, tasting notes,
          a shelf or wine-list reading, a store list or bottles like this.
        </li>
      </ul>
      {onServer && !saved && (
        <p className="small" role="status" style={{ margin: 0, color: 'var(--good)' }}>
          Your key is stored on Palate’s server, so it works on every device you sign in on. Nothing to enter here.
        </p>
      )}
      {saved ? (
        <div className="key-row">
          <code>{`${saved.slice(0, 10)}…${saved.slice(-4)}`}</code>
          <button
            type="button"
            className="text-link danger"
            onClick={() => {
              setApiKey('');
              setSaved('');
              onChange();
              setStatus(null);
            }}
          >
            Remove
          </button>
        </div>
      ) : onServer ? null : (
        <form
          className="url-row"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor="api-key" className="sr-only">
            Anthropic API key
          </label>
          <input
            id="api-key"
            ref={inputRef}
            className="input white"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn btn-dark" style={{ minHeight: 58 }} disabled={!draft.trim() || status?.kind === 'busy'}>
            Save
          </button>
        </form>
      )}
      {status && (
        <p className="small" role="status" style={{ margin: 0, color: status.kind === 'error' ? 'var(--danger)' : status.kind === 'ok' ? 'var(--good)' : 'var(--ink-3)' }}>
          {status.text}
        </p>
      )}
      <p className="small muted" style={{ margin: 0 }} hidden={onServer && !saved}>
        The key is stored only in this browser and sent only to Anthropic. Anyone using this device and browser could use it, so consider setting a
        monthly spend limit for it in the Anthropic Console.
      </p>
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
  const profile = useProfile();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const cloud = useCloudStatus();
  const online = cloud.state === 'syncing' || cloud.state === 'synced' || cloud.state === 'error';
  const [open, setOpen] = useState<string | null>(null);
  const [, setKeyTick] = useState(0);
  const keySaved = Boolean(getDeviceKey());
  const onServer = useServerKey();
  const everything = useAllWines();
  const [priceAuto, setPriceAuto] = usePriceAuto();
  const [checkedHere] = usePriceCheckedAt();
  const watch = useMemo(() => {
    const watched = everything ? watchedWines(everything) : [];
    return { n: watched.length, drops: everything ? priceDrops(everything).length : 0, last: lastCheckedAt(watched, checkedHere) };
  }, [everything, checkedHere]);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage !== undefined && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB`))
      .catch(() => {});
  }, [wines?.length]);

  const taste = useMemo(() => (wines ? buildTaste(wines) : null), [wines]);
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

  const pills = [...new Set([...profileFavourites(profile), ...(taste?.enough ? taste.likes.filter((a) => a.kind !== 'country').map((a) => a.value) : [...stats.grapes, ...stats.regions].map((t) => t.value))])].slice(0, 12);
  const skips = [...new Set(taste?.dislikes.length ? taste.dislikes.map((a) => a.value) : stats.passes.map((t) => t.value))].slice(0, 8);
  const maxCountry = Math.max(1, ...stats.countries.map((c) => c.count));
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k));

  return (
    <div className="palate-page">
      {taste && <TasteHeader taste={taste} favouriteRed={favouriteRed(profile)} />}
      {taste && <TasteQuote taste={taste} />}

      <div className="stats">
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

      {profile && (
        <section className="palate-section">
          <h2 className="title-lg">What Palate knows about you</h2>
          <ProfileSummary profile={profile} />
        </section>
      )}

      <section className="palate-section">
        <h2 className="title-lg">Where you love</h2>
        {stats.countries.length === 0 ? (
          <p className="footnote">Add countries to wines you love to see where they come from.</p>
        ) : (
          <div className="bars">
            {stats.countries.slice(0, 6).map((r) => (
              <div key={r.value} className="bar-row">
                <span className="name">{r.value}</span>
                <span className="muted">{r.count} loved</span>
                <span className="track">
                  <i style={{ width: `${(r.count / maxCountry) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="palate-section">
        <h2 className="title-lg">Grapes &amp; regions</h2>
        {pills.length === 0 ? (
          <p className="footnote">Rate a few wines “Loved it” to see patterns.</p>
        ) : (
          <div className="chips">
            {pills.map((v) => (
              <span key={v} className="love-pill">
                {v}
              </span>
            ))}
          </div>
        )}
        {skips.length > 0 && (
          <>
            <div className="eyebrow" style={{ marginTop: 22 }}>
              You’d skip
            </div>
            <div className="chips">
              {skips.map((v) => (
                <span key={v} className="skip-pill">
                  {v}
                </span>
              ))}
            </div>
          </>
        )}
        <p className="footnote" style={{ marginTop: 18 }}>
          It updates as you rate more{taste?.price ? '.' : '. Add prices to see your usual range.'}
        </p>
      </section>

      <section className="palate-section">
        <h2 className="title-lg">Your wine profile</h2>
        <ProfileImport />
      </section>

      <section className="palate-section">
        <h2 className="title-lg">Price watch</h2>
        <Link to="/watch" className="cta-card lift watch-link">
          <BellIcon size={22} filled={watch.drops > 0} />
          <span className="cta-text">
            <strong>
              {watch.drops > 0 ? (
                <>
                  {watch.drops} {watch.drops === 1 ? 'favourite' : 'favourites'} <em>got cheaper</em>
                </>
              ) : watch.n > 0 ? (
                <>
                  Watching <em>{watch.n} {watch.n === 1 ? 'bottle' : 'bottles'}</em>
                </>
              ) : (
                <>
                  Watch <em>a price</em>
                </>
              )}
            </strong>
            <span className="small muted">
              {watch.n > 0
                ? watch.last
                  ? `Checked ${ago(watch.last)} at your stores`
                  : 'Not checked yet'
                : 'Tap the bell on a loved wine or a Want to try bottle.'}
            </span>
          </span>
          <ChevronRight size={20} strokeWidth={1.7} />
        </Link>
      </section>

      <section className="palate-section">
        <h2 className="title-lg">Settings</h2>
        <div className="folds">
          <Fold title="Sync across devices" status={cloudSummary(cloud)} open={open === 'sync'} onToggle={() => toggle('sync')}>
            <CloudSync bare />
          </Fold>
          <Fold title="Label reading with Claude" status={keySaved ? 'Key saved on this device' : onServer ? 'Key stored on the server' : 'No key yet'} open={open === 'key'} onToggle={() => toggle('key')}>
            <LabelReadingSettings onFocusRequest={() => setOpen('key')} onChange={() => setKeyTick((t) => t + 1)} />
          </Fold>
          <Fold
            title="Price watch"
            status={watch.n === 0 ? 'Nothing watched' : !priceAuto ? 'Auto-check off' : onServer ? 'Checks every Monday' : 'Checks weekly'}
            open={open === 'watch'}
            onToggle={() => toggle('watch')}
          >
            <div className="fold-content">
              <label className="switch-row">
                <span>
                  <span className="switch-title">Check prices automatically</span>
                  <span className="small muted">
                    {onServer
                      ? 'Every Monday morning on Palate’s server, even if you don’t open the app, if you’re watching any bottles.'
                      : 'Once a week, when you open Palate, if you’re watching any bottles.'}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={priceAuto}
                  onChange={(e) => {
                    setPriceAuto(e.target.checked);
                    // The Monday check on the server reads this from your account.
                    void saveAccountSetting('price_auto', e.target.checked).catch(() => {});
                  }}
                />
              </label>
            </div>
          </Fold>
          <Fold title="Your data" status={usage ? `${usage} on this device` : 'On this device'} open={open === 'data'} onToggle={() => toggle('data')}>
            <div className="fold-content">
              <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
                {online
                  ? `Your wines and photos are stored on this device${usage ? ` (${usage})` : ''} and saved online. A backup file is an extra copy you keep yourself.`
                  : `Your wines and photos are stored privately on this device${usage ? ` (${usage})` : ''}. Export a backup now and then, and use it to move your collection to another phone or computer.`}
              </p>
              {persisted === false && !online && (
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
                <button type="button" className="btn btn-white" onClick={() => fileRef.current?.click()}>
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
            </div>
          </Fold>
        </div>
      </section>
    </div>
  );
}

/** A settings row that folds away: title, one-line status, and +/−. */
function Fold({ title, status, open, onToggle, children }: { title: string; status: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className={`fold${open ? ' open' : ''}`}>
      <button type="button" className="fold-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span>
          <span className="fold-title">{title}</span>
          <span className="fold-status">{status}</span>
        </span>
        <span className="fold-mark" aria-hidden="true">
          {open ? <Minus size={18} strokeWidth={1.6} /> : <Plus size={18} strokeWidth={1.6} />}
        </span>
      </button>
      <div id={id} className="fold-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
