import { useEffect, useState } from 'react';
import { useWines } from '../hooks';
import { cloudConfigured } from '../lib/cloud';
import { changesSince, fetchShared, lovedToShare, publishLoved, SHARE_NAME, shareUrl, stopSharing, type SharedList } from '../lib/share';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** Send the link: the phone's share sheet where there is one, else copy it. */
async function send(n: number, toast: (m: string) => void) {
  const url = shareUrl();
  const text = `My loved wines: ${n} ${n === 1 ? 'bottle' : 'bottles'} I’d happily buy again 🍷`;
  if (navigator.share) {
    try {
      await navigator.share({ title: `${SHARE_NAME}’s loved wines`, text, url });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Link copied');
  } catch {
    toast(url);
  }
}

/** Share your Loved wines as a read-only page, update it, or stop sharing. */
export function ShareSheet({ onClose }: { onClose: () => void }) {
  const wines = useWines();
  const toast = useToast();
  const [shared, setShared] = useState<SharedList | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loved = lovedToShare(wines ?? []);

  useEffect(() => {
    fetchShared()
      .then(setShared)
      .catch(() => setShared(null));
  }, []);

  const publish = async (thenSend: boolean) => {
    if (!wines) return;
    setError(null);
    setBusy(shared ? 'Updating…' : 'Making your page…');
    const out = await publishLoved(wines);
    setBusy(null);
    if (!out.ok) return setError(out.reason);
    setShared(out.list);
    if (thenSend) await send(out.list.wines.length, toast);
    else toast('Shared page updated');
  };

  const stop = async () => {
    setError(null);
    setBusy('Stopping…');
    const out = await stopSharing();
    setBusy(null);
    if (!out.ok) return setError(out.reason);
    setShared(null);
    toast('Sharing stopped. The link no longer shows your wines.');
  };

  const changes = shared && wines ? changesSince(shared, wines) : 0;

  return (
    <Sheet title="Share your loved wines" onClose={onClose}>
      <div className="share-body">
        {!cloudConfigured ? (
          <p className="small muted">Sharing needs Palate’s online storage, which isn’t set up for this app.</p>
        ) : shared === undefined ? (
          <p className="small muted">Checking…</p>
        ) : (
          <>
            <p className="share-lede">
              A page anyone with the link can open: your {loved.length} loved {loved.length === 1 ? 'wine' : 'wines'}, with photos and Palate’s descriptions. Your own notes,
              prices and bottles at home stay private.
            </p>
            <div className="share-link">{shareUrl().replace(/^https?:\/\//, '')}</div>
            {shared ? (
              <p className="small muted">
                Shared {day(shared.sharedAt)} · {shared.wines.length} {shared.wines.length === 1 ? 'wine' : 'wines'}
                {changes > 0 && ` · ${changes} ${changes === 1 ? 'change' : 'changes'} since — tap Update`}
              </p>
            ) : (
              <p className="small muted">Not shared yet.</p>
            )}
            {error && <p className="small" style={{ color: 'var(--warn)', margin: 0 }}>Couldn’t do that: {error}.</p>}
            <div className="share-actions">
              {shared ? (
                <>
                  <button type="button" className="btn btn-wine" disabled={Boolean(busy)} onClick={() => void send(shared.wines.length, toast)}>
                    Send link
                  </button>
                  <button type="button" className="btn btn-tone" disabled={Boolean(busy)} onClick={() => void publish(false)}>
                    {busy === 'Updating…' ? busy : 'Update'}
                  </button>
                  <a className="btn btn-tone" href={shareUrl()} target="_blank" rel="noreferrer">
                    Open page
                  </a>
                </>
              ) : (
                <button type="button" className="btn btn-wine" disabled={Boolean(busy) || loved.length === 0} onClick={() => void publish(true)}>
                  {busy ?? 'Share link'}
                </button>
              )}
            </div>
            {shared && (
              <button type="button" className="text-link share-stop" disabled={Boolean(busy)} onClick={() => void stop()}>
                {busy === 'Stopping…' ? busy : 'Stop sharing'}
              </button>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
