import { useId } from 'react';
import type { Glass, GlassShape } from '../lib/glass';

/** Each glass's bowl, where the wine's surface sits, its stem's top and the shine's path (viewBox 0 0 100 212). */
const SHAPES: Record<GlassShape, { bowl: string; surface: number; stem: number; shine: string }> = {
  burgundy: {
    bowl: 'M20 6 C23 10 24 16 24 24 C24 44 8 64 5 92 C3 112 10 126 30 128 L70 128 C90 126 97 112 95 92 C92 64 76 44 76 24 C76 16 77 10 80 6 Z',
    surface: 98,
    stem: 128,
    shine: 'M70 20 C70 40 82 58 88 80',
  },
  bordeaux: { bowl: 'M25 6 C22 30 12 52 12 80 C12 106 30 124 50 124 C70 124 88 106 88 80 C88 52 78 30 75 6 Z', surface: 80, stem: 124, shine: 'M70 14 C76 40 80 70 74 100' },
  fullWhite: { bowl: 'M25 30 C24 54 15 70 15 92 C15 114 32 128 50 128 C68 128 85 114 85 92 C85 70 76 54 75 30 Z', surface: 94, stem: 128, shine: 'M70 14 C76 40 80 70 74 100' },
  crispWhite: { bowl: 'M30 40 C28 60 22 74 22 92 C22 114 35 128 50 128 C65 128 78 114 78 92 C78 74 72 60 70 40 Z', surface: 98, stem: 128, shine: 'M70 14 C76 40 80 70 74 100' },
  rose: { bowl: 'M24 46 C29 58 20 78 20 96 C20 116 34 130 50 130 C66 130 80 116 80 96 C80 78 71 58 76 46 Z', surface: 100, stem: 130, shine: 'M70 14 C76 40 80 70 74 100' },
  sparkling: { bowl: 'M35 4 C34 50 33 90 38 120 C41 134 46 140 50 140 C54 140 59 134 62 120 C67 90 66 50 65 4 Z', surface: 30, stem: 140, shine: 'M70 14 C76 40 80 70 74 100' },
  dessert: { bowl: 'M35 80 C33 92 28 100 28 112 C28 126 38 132 50 132 C62 132 72 126 72 112 C72 100 67 92 65 80 Z', surface: 110, stem: 132, shine: 'M70 14 C76 40 80 70 74 100' },
};

const BUBBLES: [number, number][] = [
  [46, 110],
  [53, 90],
  [48, 70],
  [55, 52],
  [47, 44],
];

/** A thin-stemmed, clear glass filled with the wine's colour. */
export function GlassArt({ glass, width = 88 }: { glass: Glass; width?: number }) {
  const id = useId().replace(/:/g, '');
  const s = SHAPES[glass.shape];
  return (
    <svg width={width} height={(width * 212) / 100} viewBox="0 0 100 212" fill="none" aria-hidden="true">
      <defs>
        <clipPath id={`c${id}`}>
          <path d={s.bowl} />
        </clipPath>
        <linearGradient id={`w${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={glass.fill[0]} />
          <stop offset="1" stopColor={glass.fill[1]} />
        </linearGradient>
      </defs>
      <path d={s.bowl} fill="#fff" fillOpacity=".55" />
      <g clipPath={`url(#c${id})`}>
        <rect x="0" y={s.surface} width="100" height={212 - s.surface} fill={`url(#w${id})`} />
        <rect x="0" y={s.surface} width="100" height="1.6" fill="#fff" opacity=".45" />
        {glass.shape === 'sparkling' && BUBBLES.map(([cx, cy]) => <circle key={cy} cx={cx} cy={cy} r="1.3" fill="#fff" opacity=".8" />)}
        <path d={s.shine} stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".75" />
      </g>
      <path d={s.bowl} stroke="#b9ad9e" strokeWidth=".9" />
      <rect x="49.3" y={s.stem} width="1.4" height={202 - s.stem} fill="#c9bead" />
      <ellipse cx="50" cy="204" rx="28" ry="4.2" fill="#fff" fillOpacity=".6" stroke="#b9ad9e" strokeWidth=".9" />
    </svg>
  );
}
