import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { loadRefresh, refreshOpen, requestRefresh, type RefreshJob, type TwStock } from '../lib/twStock';
import { reloadTwStock } from '../lib/usePicks';
import { ago } from './StorePicks';

/** What a refresh is doing, in a few words. */
export function refreshLine(job: RefreshJob): string {
  if (job.status === 'queued') return 'Refresh asked for. It starts when your computer has Chrome open.';
  if (job.status === 'running') return `Refreshing stock: page ${job.next_page}${job.total_pages ? ` of ${job.total_pages}` : ''}…`;
  if (job.status === 'needs_you') return job.message || 'Total Wine wants a quick check on your computer.';
  return '';
}

/**
 * Total Wine stock: how old it is, a Refresh button that asks the extension on your computer to
 * import your lists again, and the refresh's progress while it runs (the extension also refreshes
 * every Monday at 10am).
 */
export function StockRefresh({ stock }: { stock: TwStock | null }) {
  const [state, setState] = useState<{ lists: number; job: RefreshJob | null } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const wasOpen = useRef(false);

  useEffect(() => {
    let live = true;
    let timer = 0;
    const check = async () => {
      const s = await loadRefresh().catch(() => null);
      if (!live) return;
      setState(s);
      const open = refreshOpen(s?.job ?? null);
      // A refresh just finished: use the new stock.
      if (wasOpen.current && !open) reloadTwStock();
      wasOpen.current = open;
      if (open) timer = window.setTimeout(check, 20000);
    };
    void check();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [busy]);

  if (!state || state.lists === 0) return null;
  const open = refreshOpen(state.job);
  const failed = state.job && ['failed', 'expired'].includes(state.job.status) && !open;

  const ask = async () => {
    setBusy(true);
    setError('');
    try {
      await requestRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t ask for a refresh.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stock-refresh small" role="status">
      {open ? (
        <span>{refreshLine(state.job!)}</span>
      ) : (
        <>
          <span>
            {stock ? `Stock from ${ago(stock.importedAt)}` : 'No stock from the last 10 days'}
            {failed ? ' · last refresh didn’t finish' : ''}
          </span>
          <button type="button" className="text-link" disabled={busy} onClick={ask}>
            <RefreshCw size={13} strokeWidth={1.8} /> Refresh stock
          </button>
        </>
      )}
      {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}
