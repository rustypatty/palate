import { Cloud, RefreshCw } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { cloudStatus, makeSignInCode, sendLink, signOut, syncNow, verifyCode } from '../lib/cloud';

/** Opened from the Home Screen icon (iPhone) or as an installed app. */
const installed = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function useCloudStatus() {
  return useSyncExternalStore(cloudStatus.subscribe, cloudStatus.get);
}

function ago(t: number, now: number): string {
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString();
}

/** One line for the folded settings row. */
export function cloudSummary(status: ReturnType<typeof useCloudStatus>, now = Date.now()): string {
  if (status.state === 'off') return 'Not set up · this device only';
  if (status.state === 'signed-out') return 'Not signed in · this device only';
  if (status.state === 'syncing') return 'Syncing…';
  if (status.state === 'error') return 'Couldn’t sync';
  return `Signed in · synced ${status.lastSyncedAt ? ago(status.lastSyncedAt, now) : 'just now'}`;
}

/** Sign in (once per device) and see sync status. */
export function CloudSync({ bare = false }: { bare?: boolean } = {}) {
  const status = useCloudStatus();
  const [email, setEmail] = useState(() => localStorage.getItem('palate.email') ?? '');
  // The Home Screen app can't use the email's link (it opens in Safari), so it starts at the code.
  const [step, setStep] = useState<'email' | 'sent' | 'code'>(() => (installed() ? 'code' : 'email'));
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [shownCode, setShownCode] = useState<{ code: string; at: number } | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (status.state === 'off') {
    return (
      <section className={bare ? 'fold-content' : 'card-box'}>
        {!bare && <Title />}
        <p className="small muted" style={{ margin: 0 }}>
          Online storage isn’t set up for this site yet, so your wines are only on this device.
        </p>
      </section>
    );
  }

  if (status.state !== 'signed-out') {
    const when = status.lastSyncedAt ? ago(status.lastSyncedAt, now) : null;
    return (
      <section className={bare ? 'fold-content' : 'card-box'}>
        {!bare && <Title />}
        <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
          Signed in as <strong>{status.email}</strong>. Your wines and photos are saved online and stay in step on every device you sign in on.
        </p>
        <p
          className="small"
          role="status"
          style={{ margin: 0, color: status.state === 'error' ? 'var(--danger)' : status.state === 'synced' ? 'var(--good)' : 'var(--ink-3)' }}
        >
          {status.state === 'syncing'
            ? 'Syncing…'
            : status.state === 'error'
              ? `Couldn’t sync: ${status.message}`
              : `Up to date · synced ${when}`}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-white btn-sm" disabled={status.state === 'syncing'} onClick={() => void syncNow()}>
            <RefreshCw size={16} /> Sync now
          </button>
          <button
            type="button"
            className="btn btn-white btn-sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              const r = await makeSignInCode();
              setBusy(false);
              if ('code' in r) setShownCode({ code: r.code, at: Date.now() });
              else setMessage({ kind: 'error', text: r.error });
            }}
          >
            Show a sign-in code
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
        {shownCode && now - shownCode.at < 3_600_000 && (
          <div className="signin-code" role="status">
            <div className="signin-code-digits">{shownCode.code}</div>
            <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
              To sign in on another device (like Palate on your Home Screen), choose <strong>Sign in with a code</strong> there and type this. It
              works once, for the next hour.
            </p>
          </div>
        )}
        {message && (
          <p className="small" role="status" style={{ margin: 0, color: 'var(--danger)' }}>
            {message.text}
          </p>
        )}
      </section>
    );
  }

  const send = async () => {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) {
      setMessage({ kind: 'error', text: 'Enter your email address.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const err = await sendLink(e);
    setBusy(false);
    if (err) {
      setMessage({ kind: 'error', text: err });
      return;
    }
    localStorage.setItem('palate.email', e);
    setEmail(e);
    setStep('sent');
  };

  const enterCode = async () => {
    const e = email.trim().toLowerCase();
    const c = code.replace(/\D/g, '');
    if (!/^\S+@\S+\.\S+$/.test(e)) {
      setMessage({ kind: 'error', text: 'Enter your email address.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const err = await verifyCode(e, c);
    setBusy(false);
    if (err) {
      setMessage({ kind: 'error', text: err });
      return;
    }
    localStorage.setItem('palate.email', e);
    // Signed in: the status changes and this screen shows the sync instead.
  };

  const shown = message ?? (status.message ? { kind: 'error' as const, text: status.message } : null);

  return (
    <section className={bare ? 'fold-content' : 'card-box'}>
      {!bare && <Title />}
      {step === 'code' ? (
        <>
          <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
            On a device where you’re already signed in (like Palate in Safari), open <strong>My palate › Settings › Sync across devices</strong>{' '}
            and tap <strong>Show a sign-in code</strong>. Then enter your email and that code here.
          </p>
          <form
            style={{ display: 'grid', gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              void enterCode();
            }}
          >
            <label htmlFor="code-email" className="sr-only">
              Email
            </label>
            <input
              id="code-email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="url-row">
              <label htmlFor="cloud-code" className="sr-only">
                Sign-in code
              </label>
              <input
                id="cloud-code"
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Sign-in code"
                maxLength={12}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button type="submit" className="btn btn-dark" style={{ minHeight: 58 }} disabled={busy || code.replace(/\D/g, '').length < 6 || !email.trim()}>
                {busy ? 'Checking…' : 'Sign in'}
              </button>
            </div>
          </form>
          <button
            type="button"
            className="text-link"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              setStep('email');
              setMessage(null);
            }}
          >
            Email me a sign-in link instead
          </button>
        </>
      ) : step === 'email' ? (
        <>
          <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
            Sign in to save your wines online and see them on your phone and computer. You only sign in once on each device.
          </p>
          <form
            className="url-row"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="cloud-email" className="sr-only">
              Email
            </label>
            <input
              id="cloud-email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="btn btn-dark" style={{ minHeight: 58 }} disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Email me a link'}
            </button>
          </form>
          <button
            type="button"
            className="text-link"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              setStep('code');
              setMessage(null);
            }}
          >
            Signed in on another device? Sign in with a code
          </button>
        </>
      ) : (
        <>
          <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
            We emailed a sign-in link to <strong>{email}</strong>. It can take a minute to arrive.
          </p>
          <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
            Open the email <strong>on this device</strong> and tap <strong>Sign in</strong>. If it opens inside your email app instead of
            Safari, use its menu to open it in Safari.
          </p>
        </>
      )}
      {shown && (
        <p className="small" role="status" style={{ margin: 0, color: shown.kind === 'error' ? 'var(--danger)' : 'var(--ink-2)' }}>
          {shown.text}
        </p>
      )}
      {step === 'sent' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void send()}>
            Send it again
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setStep('email');
              setMessage(null);
            }}
          >
            Use a different email
          </button>
        </div>
      )}
    </section>
  );
}

function Title() {
  return (
    <h2 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
      <Cloud size={14} /> Sync across devices
    </h2>
  );
}
