import type { AboutWine as About } from '../types';

/** Published tasting notes, always shown with their source and kept apart from the user's own notes. */
export function AboutWine({ about, onRemove }: { about: About; onRemove?: () => void }) {
  return (
    <div className="about-wine">
      <p className="notes" style={{ margin: 0 }}>{about.text}</p>
      <div className="row-between small" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <span className="muted">
          Source:{' '}
          {about.sourceUrl ? (
            <a href={about.sourceUrl} target="_blank" rel="noreferrer">
              {about.sourceName || 'web'}
            </a>
          ) : (
            about.sourceName || 'web'
          )}{' '}
          · summarised by Claude
        </span>
        {onRemove && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
