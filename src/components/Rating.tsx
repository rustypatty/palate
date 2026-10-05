import { Heart, ThumbsDown, ThumbsUp } from 'lucide-react';
import { RATINGS } from '../lib/constants';
import type { Rating } from '../types';

export function RatingIcon({ rating, size = 14, filled = true }: { rating: Rating; size?: number; filled?: boolean }) {
  if (rating === 'loved') return <Heart size={size} fill={filled ? 'currentColor' : 'none'} strokeWidth={filled ? 0 : 1.7} />;
  if (rating === 'liked') return <ThumbsUp size={size} strokeWidth={1.7} fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.25 : 0} />;
  return <ThumbsDown size={size} strokeWidth={1.7} fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.25 : 0} />;
}

const BADGE_TEXT: Record<Rating, string> = { loved: 'Loved', liked: 'Liked', wouldnt: 'Wouldn’t buy' };

export function RatingBadge({ rating }: { rating: Rating }) {
  const full = RATINGS.find((r) => r.value === rating)!.label;
  return (
    <span className={`rating-badge ${rating}`} title={full}>
      {rating === 'loved' && <Heart size={11} fill="currentColor" strokeWidth={0} />}
      <span aria-hidden="true">{BADGE_TEXT[rating]}</span>
      <span className="sr-only">{full}</span>
    </span>
  );
}

/** Three big, one-tap rating tiles. Tapping the chosen rating again clears it. */
export function RatingPicker({ value, onChange, compact = false }: { value: Rating | null; onChange: (r: Rating | null) => void; compact?: boolean }) {
  return (
    <div className={`rating-picker${compact ? ' compact' : ''}`} role="group" aria-label="Rating">
      {RATINGS.map((r) => (
        <button
          key={r.value}
          type="button"
          className={`rating-option ${r.value}`}
          aria-pressed={value === r.value}
          onClick={() => onChange(value === r.value ? null : r.value)}
        >
          <RatingIcon rating={r.value} size={20} filled={value === r.value} />
          {r.label}
        </button>
      ))}
    </div>
  );
}
