import { Sparkles } from 'lucide-react';
import type { TasteProfile } from '../lib/taste';
import { RatePrompt } from './StorePicks';

/** "Your taste", in plain language, on the My palate page. */
export function TasteCard({ taste }: { taste: TasteProfile }) {
  if (!taste.enough) return <RatePrompt rated={taste.rated} />;
  const likes = taste.likes.filter((a) => a.kind !== 'country').slice(0, 6);
  const avoid = taste.dislikes.slice(0, 4);
  return (
    <section className="taste-card">
      <h2 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Sparkles size={14} /> Your taste
      </h2>
      {taste.summary.map((line) => (
        <p key={line} className={line.startsWith('In your words') ? 'taste-quote' : 'taste-line'}>
          {line}
        </p>
      ))}
      {likes.length > 0 && (
        <div className="taste-tags" aria-label="You enjoy">
          {likes.map((a) => (
            <span key={`${a.kind}:${a.value}`} className="tag tag-good">
              {a.value}
            </span>
          ))}
          {avoid.map((a) => (
            <span key={`${a.kind}:${a.value}`} className="tag tag-bad">
              {a.value}
            </span>
          ))}
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        From your {taste.rated} rated wines. It updates as you rate more{taste.price ? '' : ' — add prices to see your usual range'}.
      </p>
    </section>
  );
}
