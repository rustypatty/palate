import { Copy, Download } from 'lucide-react';
import { useState } from 'react';
import { makeConnectKey } from '../lib/importKey';
import type { TwStock } from '../lib/twStock';
import { ago } from './StorePicks';

/** One line for the settings row: what's imported, or what's needed. */
export function twImportSummary(stock: TwStock | null | undefined, online: boolean): string {
  if (!online) return 'Needs Sync across devices';
  if (stock === undefined) return '…';
  return stock ? `${stock.bottles.length} in stock at ${stock.storeName} · ${ago(stock.importedAt)}` : 'Nothing imported this week';
}

/** Settings: the Chrome extension that imports what your Total Wine store has in stock. */
export function TotalWineImport({ stock, online }: { stock: TwStock | null | undefined; online: boolean }) {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);

  if (!online) {
    return (
      <div className="fold-content">
        <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
          Sign in under <em>Sync across devices</em> first: imported stock is saved with your account.
        </p>
      </div>
    );
  }

  const make = async () => {
    setBusy(true);
    setNote(null);
    try {
      const k = await makeConnectKey();
      if (k) setKey(k);
      else setNote({ error: true, text: 'Sign in first.' });
    } catch (e) {
      setNote({ error: true, text: e instanceof Error ? e.message : 'Couldn’t make a key.' });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(key ?? '');
      setNote({ error: false, text: 'Copied. Paste it into the extension.' });
    } catch {
      setNote({ error: true, text: 'Couldn’t copy. Select the key and copy it.' });
    }
  };

  return (
    <div className="fold-content">
      <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
        A Chrome extension on your computer saves the Total Wine pages you open, with what your store has in stock and the aisle. Then <em>Make a list</em> on
        In store picks only from bottles on the shelf.
        {stock && ` Now: ${stock.bottles.length} bottles in stock at ${stock.storeName}, imported ${ago(stock.importedAt)}.`}
      </p>
      <ol className="small steps" style={{ margin: 0, paddingLeft: 20, color: 'var(--ink-2)' }}>
        <li>
          <a href="./palate-extension.zip" download>
            Download the extension
          </a>{' '}
          and unzip it.
        </li>
        <li>
          In Chrome, open <code>chrome://extensions</code>, turn on <em>Developer mode</em>, click <em>Load unpacked</em> and choose the unzipped folder.
        </li>
        <li>Make a connect key below and paste it into the extension (click its icon; pin it from the puzzle-piece menu).</li>
        <li>
          On totalwine.com, pick your store, open a wine category (e.g. Red Wine), choose <em>Pick Up</em> only and 120 per page, then click{' '}
          <em>Import all pages</em>. It goes through every page on its own (a few minutes for a big list). After that, the extension refreshes your lists by itself every Monday at 10am, and when you tap <em>Refresh stock</em> on In store, while your computer has Chrome open.
        </li>
      </ol>
      {key ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" readOnly value={key} aria-label="Connect key" onFocus={(e) => e.target.select()} style={{ flex: '1 1 220px', fontFamily: 'monospace' }} />
          <button type="button" className="btn btn-dark" onClick={copy}>
            <Copy size={17} /> Copy
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-dark" disabled={busy} onClick={make}>
            Make a connect key
          </button>
          <a className="btn btn-white" href="./palate-extension.zip" download>
            <Download size={18} /> Extension
          </a>
        </div>
      )}
      {key && <p className="small muted" style={{ margin: 0 }}>Shown once. A new key replaces this one.</p>}
      {note && (
        <p className="small" role="status" style={{ margin: 0, color: note.error ? 'var(--danger)' : 'var(--good)' }}>
          {note.text}
        </p>
      )}
    </div>
  );
}
