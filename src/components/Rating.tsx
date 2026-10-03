import { Heart, ThumbsDown, ThumbsUp } from 'lucide-react';
import { RATINGS } from '../lib/constants';
import type { Rating } from '../types';

export function RatingIcon({ rating, size = 14 }: { rating: Rating; size?: number }) {
  if (rating === 'loved') return <Heart size={size} fill="currentColor" strokeWidth={2} />;
  if (rating === 'liked') return <ThumbsUp size={size} strokeWidth={2.2} />;
  return <ThumbsDown size={size} strokeWidth={2.2} />;
}

const BADGE_TEXT: Record<Rating, string> = { loved: 'Loved', liked: 'Liked', wouldnt: 'Wouldn’t buy' };

export function RatingBadge({ rating }: { rating: Rating }) {
  const full = RATINGS.find((r) => r.value === rating)!.label;
  return (
    <span className={`rating-badge ${rating}`} title={full}>
      <RatingIcon rating={rating} size={12} />
      <span aria-hidden="true">{BADGE_TEXT[rating]}</span>
      <span className="sr-only">{full}</span>
    </span>
  );
}

/** Three big, one-tap rating buttons. Tapping the active rating clears it. */
export function RatingPicker({ value, onChange }: { value: Rating | null; onChange: (r: Rating | null) => void }) {
  return (
    <div className="rating-picker" role="group" aria-label="Rating">
      {RATINGS.map((r) => (
        <button
          key={r.value}
          type="button"
          className={`rating-option ${r.value}`}
          aria-pressed={value === r.value}
          onClick={() => onChange(value === r.value ? null : r.value)}
        >
          <RatingIcon rating={r.value} size={22} />
          {r.label}
        </button>
      ))}
    </div>
  );
}
