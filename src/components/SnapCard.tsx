import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface SnapCardContent {
  /** Which content this is; a change cross-fades from the old to the new. */
  id: string;
  icon: ReactNode;
  cost: string;
  title: string;
  line: string;
  link: string;
  /** Spoken name of the main action, e.g. "Snap a shelf: take a photo". */
  label: string;
}

const FADE_MS = 280;

/**
 * The burgundy snap card. Tapping it opens the camera; the light link at the bottom picks
 * from your photos. When its content changes, the old content fades out as the new fades in,
 * in a card that keeps its size (no jump).
 */
export function SnapCard({ content, onCamera, onLibrary }: { content: SnapCardContent; onCamera: () => void; onLibrary: () => void }) {
  const [leaving, setLeaving] = useState<SnapCardContent | null>(null);
  const shown = useRef(content);
  useEffect(() => {
    if (shown.current.id === content.id) {
      shown.current = content;
      return;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const old = shown.current;
    shown.current = content;
    if (reduce) return;
    setLeaving(old);
    const t = window.setTimeout(() => setLeaving(null), FADE_MS);
    return () => window.clearTimeout(t);
  }, [content]);

  const layer = (c: SnapCardContent, state: 'in' | 'out') => (
    <div key={`${c.id}-${state}`} className={`snap-card-layer ${state}`} aria-hidden={state === 'out' || undefined}>
      <span className="snap-icon" aria-hidden="true">
        {c.icon}
      </span>
      <span className="snap-cost">{c.cost}</span>
      <span className="snap-title">{c.title}</span>
      <span className="snap-sub">{c.line}</span>
      {state === 'in' && (
        <button type="button" className="snap-card-link" onClick={onLibrary}>
          {c.link}
        </button>
      )}
      {state === 'out' && <span className="snap-card-link">{c.link}</span>}
    </div>
  );

  return (
    <div className="snap-tile snap-card">
      <button type="button" className="snap-card-hit" onClick={onCamera} aria-label={content.label} />
      {leaving && layer(leaving, 'out')}
      {layer(content, 'in')}
    </div>
  );
}
