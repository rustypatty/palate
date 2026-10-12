import { ChevronRight, Download, EyeOff, Stamp, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CloudSync, cloudSummary, useCloudStatus } from '../components/CloudSync';
import { TasteHeader } from '../components/TasteCard';
import { ProfileImport, ProfileSummary, useProfile } from '../components/ProfileImport';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { TotalWineImport } from '../components/TotalWineImport';
import { useAllWines, useLists, useWines } from '../hooks';
import { downloadBlob, exportBackup, importBackup } from '../lib/backup';
import { tally } from '../lib/filters';
import { apiKeyProblem, getDeviceKey, normalizeApiKey, setApiKey, testApiKey } from '../lib/labelReader';
import { saveAccountSetting } from '../lib/cloud';
import { useServerKey } from '../lib/serverKey';
import { buildPassport } from '../lib/passport';
import { disablePush, enablePush, pushEnabled, pushSupport, sendTestPush } from '../lib/push';
import { favouriteRed } from '../lib/profile';
import { budgetLine, exploreCards, heroSummary, loveChips, redsLine, skipsLine, whitesLine } from '../lib/palatePage';
import { buildTaste } from '../lib/taste';
import { lastCheckedAt, priceDrops, watchedWines } from '../lib/priceWatch';
import { usePriceAuto, usePriceCheckedAt, useTwStock } from '../lib/usePicks';
import { ago } from '../components/StorePicks';

/** Phone alerts when the Monday check finds a lower price. */
function PriceAlerts() {
  const support = pushSupport();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    void pushEnabled().then(setOn);
  }, []);

  if (support === 'no') return null;
  if (support === 'home-screen') {
    return <p className="small muted" style={{ margin: 0 }}>To get an alert when a price drops, add Palate to your Home Screen (Share › Add to Home Screen) and turn alerts on there.</p>;
  }

  const change = async (want: boolean) => {
    setBusy(true);
    setNote(null);
    if (want) {
      const error = await enablePush();
      setOn(error === null);
      if (error) setNote({ error: true, text: error });
    } else {
      await disablePush();
      setOn(false);
    }
    setBusy(false);
  };

  return (
    <>
      <label className="switch-row">
        <span>
          <span className="switch-title">Tell me when a price drops</span>
          <span className="small muted">A notification on this device when a bottle you watch gets cheaper.</span>
        </span>
        <input type="checkbox" role="switch" className="switch" checked={Boolean(on)} disabled={on === null || busy} onChange={(e) => void change(e.target.checked)} />
      </label>
      {on && (
        <button
          type="button"
          className="text-link"
          style={{ alignSelf: 'flex-start' }}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await sendTestPush();
            setNote(ok ? { error: false, text: 'Sent. It should arrive in a few seconds.' } : { error: true, text: 'Couldn’t send a test alert.' });
            setBusy(false);
          }}
        >
          Send a test alert
        </button>
      )}
      {note && (
        <p className="small" role="status" style={{ margin: 0, color: note.error ? 'var(--danger)' : 'var(--good)' }}>
          {note.text}
        </p>
      )}
    </>
  );
}

function LabelReadingSettings({ onChange }: { onChange: () => void }) {
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

type SheetName = 'watch' | 'profile' | 'tw' | 'sync' | 'data';

export function ProfilePage() {
  const wines = useWines();
  const lists = useLists();
  const profile = useProfile();
  const toast = useToast();
  const location = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const cloud = useCloudStatus();
  const online = cloud.state === 'syncing' || cloud.state === 'synced' || cloud.state === 'error';
  const twStock = useTwStock(online);
  // "Add key" elsewhere in the app comes here to the key field: open Sync & Claude.
  const focusKey = (location.state as { focusKey?: number } | null)?.focusKey;
  const [open, setOpen] = useState<SheetName | null>(focusKey ? 'sync' : null);
  useEffect(() => {
    if (focusKey) setOpen('sync');
  }, [focusKey]);
  const [, setKeyTick] = useState(0);
  const onServer = useServerKey();
  const everything = useAllWines();
  const [priceAuto, setPriceAuto] = usePriceAuto();
  const [checkedHere] = usePriceCheckedAt();
  const watch = useMemo(() => {
    const watched = everything ? watchedWines(everything) : [];
    return { n: watched.length, drops: everything ? priceDrops(everything).length : 0, last: lastCheckedAt(watched, checkedHere) };
  }, [everything, checkedHere]);
  const passport = useMemo(() => {
    const p = everything ? buildPassport(everything) : null;
    return { tasted: p?.tasted ?? 0, places: p?.places.length ?? 0, grapes: p?.grapes.length ?? 0 };
  }, [everything]);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage !== undefined && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB`))
      .catch(() => {});
  }, [wines?.length]);

  const taste = useMemo(() => (wines ? buildTaste(wines) : null), [wines]);
  const stats = useMemo(() => {
    const all = wines ?? [];
    const loved = all.filter((w) => w.rating === 'loved');
    return {
      total: all.length,
      loved: loved.length,
      owned: all.reduce((n, w) => n + w.owned, 0),
      countries: tally(loved.map((w) => w.country)),
      places: [...tally(loved.map((w) => w.region)), ...tally(loved.flatMap((w) => w.grapes))].map((t) => t.value),
    };
  }, [wines]);

  if (wines === undefined) return null;

  const fav = favouriteRed(profile);
  const summary = heroSummary(profile, taste, !fav);
  const rows = [
    { label: 'Reds', text: redsLine(profile) },
    { label: 'Whites', text: whitesLine(profile) },
    { label: 'Skips', text: skipsLine(taste, wines) },
    { label: 'Budget', text: budgetLine(wines, profile) },
  ].filter((r) => r.text);
  const chips = loveChips(profile, taste, stats.places, fav);
  const skips = [...new Set(taste?.dislikes.map((a) => a.value) ?? [])].slice(0, 8);
  const explore = exploreCards(profile);
  const maxCountry = Math.max(1, ...stats.countries.map((c) => c.count));
  const toTry = lists?.want.length ?? 0;

  const watchStatus =
    watch.n === 0
      ? 'Nothing watched yet'
      : `${watch.drops > 0 ? `${watch.drops} got cheaper · ` : ''}${watch.n} ${watch.n === 1 ? 'bottle' : 'bottles'} · ${!priceAuto ? 'auto-check off' : onServer ? 'checks Mondays' : 'checks weekly'}`;
  const profileStatus = profile ? `Imported ${new Date(profile.importedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · how you like advice` : 'Not imported · import a history file';
  const twStatus = !online ? 'Needs sync' : twStock === undefined ? '…' : twStock ? `${twStock.storeName} · ${twStock.bottles.length.toLocaleString()} in stock` : 'Nothing imported this week';

  return (
    <div className="palate-page">
      {taste && (
        <TasteHeader taste={taste} favouriteRed={fav} summary={summary}>
          <div className="palate-numbers">
            <div>
              <b>{stats.total}</b>
              <span>Wines</span>
            </div>
            <div className="loved">
              <b>{stats.loved}</b>
              <span>Loved</span>
            </div>
            <div>
              <b>{stats.owned}</b>
              <span>At home</span>
            </div>
            <Link to="/want">
              <b>{toTry}</b>
              <span>To try</span>
            </Link>
          </div>
        </TasteHeader>
      )}

      {rows.length > 0 && (
        <section className="palate-section">
          <h2 className="palate-h">
            Your <em>taste</em>
          </h2>
          <dl className="taste-rows">
            {rows.map((r) => (
              <div key={r.label}>
                <dt className="eyebrow">{r.label}</dt>
                <dd>{r.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="palate-section">
        <h2 className="palate-h">
          What you <em className="wine">love</em>
        </h2>
        {stats.countries.length === 0 && chips.length === 0 ? (
          <p className="footnote">Rate a few wines “Loved it” to see patterns.</p>
        ) : (
          <>
            {stats.countries.length > 0 && (
              <div className="bars compact">
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
            {chips.length > 0 && (
              <div className="chips">
                {chips.map((v) => (
                  <span key={v} className="love-pill">
                    {v}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        {skips.length > 0 && (
          <>
            <div className="eyebrow">You’d skip</div>
            <div className="chips">
              {skips.map((v) => (
                <span key={v} className="skip-pill">
                  {v}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {explore.length > 0 && (
        <section className="palate-section">
          <h2 className="palate-h">
            Worth <em>exploring</em>
          </h2>
          <div className="explore-cards">
            {explore.map((x) => (
              <div key={x.title} className="explore-card">
                <strong>{x.title}</strong>
                {x.sub && <span>{x.sub}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="palate-section">
        <h2 className="palate-h">Learn</h2>
        <div className="palate-learn">
          <Link to="/passport" className="palate-learn-tile lift">
            <Stamp size={22} strokeWidth={1.7} />
            <strong>
              Wine <em>passport</em>
            </strong>
            <span>
              {passport.tasted > 0
                ? `${passport.places} ${passport.places === 1 ? 'region' : 'regions'} · ${passport.grapes} ${passport.grapes === 1 ? 'grape' : 'grapes'}`
                : 'Rate what you taste to collect places'}
            </span>
          </Link>
          <Link to="/blind" className="palate-learn-tile lift">
            <EyeOff size={22} strokeWidth={1.7} />
            <strong>
              Blind <em>tasting</em>
            </strong>
            <span>Guess a bottle from your cellar</span>
          </Link>
        </div>
      </section>

      <section className="palate-section">
        <h2 className="palate-h">Settings</h2>
        <div className="settings-card">
          <SettingRow title="Price watch" status={watchStatus} onOpen={() => setOpen('watch')} />
          <SettingRow title="Wine profile" status={profileStatus} onOpen={() => setOpen('profile')} />
          <SettingRow title="Total Wine store" status={twStatus} onOpen={() => setOpen('tw')} />
          <SettingRow title="Sync & Claude" status={cloudSummary(cloud)} onOpen={() => setOpen('sync')} />
          <SettingRow title="Your data" status={`${usage ?? 'On this device'} · backup & restore`} onOpen={() => setOpen('data')} />
        </div>
      </section>

      {open === 'watch' && (
        <Sheet title="Price watch" onClose={() => setOpen(null)} swipeToClose>
          <div className="fold-content">
            <Link to="/watch" className="cta-card lift watch-link">
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
                    : 'Love a wine or add one to Want to try, and Palate watches its price.'}
                </span>
              </span>
              <ChevronRight size={20} strokeWidth={1.7} />
            </Link>
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
            {onServer && <PriceAlerts />}
          </div>
        </Sheet>
      )}

      {open === 'profile' && (
        <Sheet title="Wine profile" onClose={() => setOpen(null)} tall swipeToClose>
          <div className="fold-content">
            {profile && <ProfileSummary profile={profile} />}
            <ProfileImport />
          </div>
        </Sheet>
      )}

      {open === 'tw' && (
        <Sheet title="Total Wine store" onClose={() => setOpen(null)} tall swipeToClose>
          <TotalWineImport stock={twStock} online={online} />
        </Sheet>
      )}

      {open === 'sync' && (
        <Sheet title="Sync & Claude" onClose={() => setOpen(null)} tall swipeToClose>
          <div className="fold-content">
            <div className="eyebrow">Sync across devices</div>
            <CloudSync bare />
            <div className="eyebrow" style={{ marginTop: 10 }}>
              Claude
            </div>
            <LabelReadingSettings onChange={() => setKeyTick((t) => t + 1)} />
          </div>
        </Sheet>
      )}

      {open === 'data' && (
        <Sheet title="Your data" onClose={() => setOpen(null)} swipeToClose>
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
          </div>
        </Sheet>
      )}
      {/* Outside the sheet, so restoring still works after the sheet closes. */}
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
  );
}

/** A settings row: title, one-line status, chevron; opens its sheet. */
function SettingRow({ title, status, onOpen }: { title: string; status: ReactNode; onOpen: () => void }) {
  return (
    <button type="button" className="setting-row" onClick={onOpen}>
      <span>
        <span className="setting-title">{title}</span>
        <span className="setting-status">{status}</span>
      </span>
      <ChevronRight size={18} strokeWidth={1.7} aria-hidden="true" />
    </button>
  );
}
