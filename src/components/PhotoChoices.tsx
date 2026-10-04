import type { WineLookup } from '../lib/labelReader';

type Candidate = WineLookup['candidates'][number];

/** Photos found online that Claude couldn't confirm; the user decides. */
export function PhotoChoices({ candidates, onPick }: { candidates: Candidate[]; onPick: (c: Candidate) => void }) {
  if (!candidates.length) return null;
  return (
    <div className="photo-choices">
      <div className="small" style={{ fontWeight: 650 }}>
        Is one of these your bottle? Tap to use it.
      </div>
      <div className="photo-choices-row">
        {candidates.map((c) => (
          <button key={c.url} type="button" className="candidate" onClick={() => onPick(c)} aria-label={`Use photo from ${c.siteName}`}>
            <div className="tile">
              <img className="bottle" src={c.url} alt="" loading="lazy" />
            </div>
            <div className="sub">{c.siteName}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
