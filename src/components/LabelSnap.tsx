import { Camera, Sparkles } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasApiKey, LabelReadError, readLabel, type LabelReading } from '../lib/labelReader';
import { useToast } from './Toast';
import { isStaleApp, reloadForUpdate } from '../lib/appUpdate';

/** "Snap the label" — takes a photo and has Claude read it. */
export function LabelSnap({
  onRead,
  onStart,
  label = 'Snap the label',
  className = 'btn btn-dark',
  children,
}: {
  onRead: (reading: LabelReading, photo: File) => void;
  onStart?: (photo: File) => void;
  label?: string;
  className?: string;
  /** Custom button content, e.g. the big burgundy "Snap the label" tile. */
  children?: (busy: boolean) => ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const start = () => {
    if (!hasApiKey()) {
      toast('Add your Anthropic API key to read labels');
      navigate('/profile', { state: { focusKey: Date.now() } });
      return;
    }
    inputRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    onStart?.(file);
    try {
      const reading = await readLabel(file);
      if (!reading.is_wine_label) toast('That doesn’t look like a wine label. Try again closer up.');
      onRead(reading, file);
    } catch (e) {
      if (isStaleApp(e) && reloadForUpdate()) {
        toast('Palate was updated. Reloading, then snap again.');
        return;
      }
      toast(e instanceof LabelReadError ? e.message : `Couldn’t read the label (${e instanceof Error ? e.message : 'unknown error'}). Try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={start} disabled={busy} aria-busy={busy}>
        {children ? (
          children(busy)
        ) : (
          <>
            <Sparkles size={18} /> {busy ? 'Reading label…' : label}
          </>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ''))} />
    </>
  );
}

/** Contents of the big burgundy "Snap the label" tile. */
export function snapTile(sub: string) {
  return function SnapTileContent(busy: boolean) {
    return (
      <>
        <span className="snap-icon" aria-hidden="true">
          <Camera size={22} strokeWidth={1.6} />
        </span>
        <span className="snap-cost">{LABEL_COST}</span>
        <span className="snap-title">{busy ? 'Reading the label…' : 'Snap the label'}</span>
        <span className="snap-sub">{sub}</span>
      </>
    );
  };
}

/** Rough cost of reading one label with Claude. */
export const LABEL_COST = '~2¢';
