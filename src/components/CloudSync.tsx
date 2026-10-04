import { Cloud, RefreshCw } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { cloudStatus, sendCode, signOut, syncNow, verifyCode } from '../lib/cloud';

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

/** Sign in (once per device) and see sync status. */
export function CloudSync() {
  const status = useCloudStatus();
  const [email, setEmail] = useState(() => localStorage.getItem('palate.email') ?? '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (status.state === 'off') {
    return (
      <section className="card-box">
        <Title />
        <p className="small muted" style={{ margin: 0 }}>
          Online storage isn’t set up for this site yet, so your wines are only on this device.
        </p>
      </section>
    );
  }

  if (status.state !== 'signed-out') {
    const when = status.lastSyncedAt ? ago(status.lastSyncedAt, now) : null;
    return (
      <section className="card-box">
        <Title />
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
          <button type="button" className="btn btn-outline btn-sm" disabled={status.state === 'syncing'} onClick={() => void syncNow()}>
            <RefreshCw size={16} /> Sync now
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
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
    const err = await sendCode(e);
    setBusy(false);
    if (err) {
      setMessage({ kind: 'error', text: err });
      return;
    }
    localStorage.setItem('palate.email', e);
    setEmail(e);
    setCode('');
    setStep('code');
    setMessage({ kind: 'info', text: `We emailed a code to ${e}. It can take a minute to arrive.` });
  };

  const verify = async () => {
    setBusy(true);
    setMessage(null);
    const err = await verifyCode(email, code.replace(/\s/g, ''));
    setBusy(false);
    if (err) setMessage({ kind: 'error', text: err });
  };

  return (
    <section className="card-box">
      <Title />
      <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
        Sign in to save your wines online and see them on your phone and computer. You only sign in once on each device.
      </p>
      {step === 'email' ? (
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
          <button type="submit" className="btn btn-dark" style={{ height: 50 }} disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Email me a code'}
          </button>
        </form>
      ) : (
        <form
          className="url-row"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <label htmlFor="cloud-code" className="sr-only">
            Code from the email
          </label>
          <input
            id="cloud-code"
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Code from the email"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="btn btn-dark" style={{ height: 50 }} disabled={busy || code.replace(/\D/g, '').length < 6}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      )}
      {message && (
        <p className="small" role="status" style={{ margin: 0, color: message.kind === 'error' ? 'var(--danger)' : 'var(--ink-2)' }}>
          {message.text}
        </p>
      )}
      {step === 'code' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void send()}>
            Send a new code
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
