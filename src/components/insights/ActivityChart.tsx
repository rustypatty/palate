import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { WeekPoint } from '../../lib/dashboard';

const H = 236;
const M = { t: 14, r: 62, b: 30, l: 34 };
const TIP_W = 148;
const TIP_H = 76;

/** A round top for the axis and a step that gives about three gridlines. */
export function niceScale(max: number): { top: number; step: number } {
  const raw = Math.max(max, 1) / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  return { top: Math.ceil(Math.max(max, 1) / step) * step, step };
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || 640);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width) || 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Wines added and wines tasted, week by week. Hover (or the arrow keys) moves a crosshair
 * and the readout; the table view carries the same numbers for anyone who can't use it.
 */
export function ActivityChart({ weeks }: { weeks: WeekPoint[] }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [at, setAt] = useState(weeks.length - 1);
  const [table, setTable] = useState(false);
  // The range changed under us: keep the readout on a week that exists.
  const i = Math.min(at, weeks.length - 1);

  const n = weeks.length;
  const innerW = Math.max(width - M.l - M.r, 40);
  const innerH = H - M.t - M.b;
  const { top, step } = niceScale(Math.max(...weeks.map((w) => Math.max(w.added, w.tasted))));
  const x = (k: number) => M.l + (n === 1 ? innerW / 2 : (k * innerW) / (n - 1));
  const y = (v: number) => M.t + innerH * (1 - v / top);
  const line = (pick: (w: WeekPoint) => number) => weeks.map((w, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(pick(w)).toFixed(1)}`).join(' ');
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const every = Math.max(1, Math.ceil(56 / (n === 1 ? innerW : innerW / (n - 1))));

  const cur = weeks[i];
  // Put the readout where it covers the least of the lines: beside the crosshair, top or bottom.
  const dots: [number, number][] = [];
  for (const pick of [(w: WeekPoint) => w.added, (w: WeekPoint) => w.tasted]) {
    for (let k = 0; k < n - 1; k++) {
      const steps = Math.max(1, Math.ceil((x(k + 1) - x(k)) / 4));
      for (let s = 0; s <= steps; s++) dots.push([x(k) + ((x(k + 1) - x(k)) * s) / steps, y(pick(weeks[k])) + ((y(pick(weeks[k + 1])) - y(pick(weeks[k]))) * s) / steps]);
    }
  }
  const yTop = M.t + 4;
  const yLow = M.t + innerH - TIP_H - 8;
  const spots = [
    [x(i) + 12, yTop],
    [x(i) - TIP_W - 12, yTop],
    [x(i) + 12, yLow],
    [x(i) - TIP_W - 12, yLow],
  ].filter(([sx]) => sx >= M.l && sx + TIP_W <= width);
  const hits = ([sx, sy]: number[]) => dots.filter(([dx, dy]) => dx > sx - 6 && dx < sx + TIP_W + 6 && dy > sy - 6 && dy < sy + TIP_H + 6).length;
  const [tipX, tipY] = (spots.length ? spots : [[Math.max(M.l, x(i) - TIP_W / 2), yTop]]).reduce((best, s) => (hits(s) < hits(best) ? s : best));
  const last = weeks[n - 1];
  const endLabels = Math.abs(y(last.added) - y(last.tasted)) >= 16;
  const slot = innerW / Math.max(n - 1, 1);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setAt(Math.max(0, i - 1));
    else if (e.key === 'ArrowRight') setAt(Math.min(n - 1, i + 1));
    else return;
    e.preventDefault();
  };

  return (
    <>
      <div className="ins-card-head">
        <div>
          <h2 className="ins-ct">Weekly activity</h2>
          <p className="ins-cs">Wines added and wines tasted, by week</p>
        </div>
        <div className="ins-head-tools">
          <div className="ins-legend">
            <span><i className="ins-key" />Added</span>
            <span><i className="ins-key b" />Tasted</span>
          </div>
          <button type="button" className="ins-mini" aria-pressed={table} onClick={() => setTable((t) => !t)}>
            {table ? 'Hide table' : 'Table view'}
          </button>
        </div>
      </div>

      <div ref={box} className="ins-chart">
        <svg
          width={width}
          height={H}
          tabIndex={0}
          role="group"
          aria-label={`Wines added and tasted per week. Week of ${cur.label}: ${cur.added} added, ${cur.tasted} tasted. Use the left and right arrow keys to change week.`}
          onKeyDown={onKey}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={M.l + innerW} y1={y(v)} y2={y(v)} className={v === 0 ? 'ins-base' : 'ins-grid'} />
              <text x={M.l - 8} y={y(v) + 4} textAnchor="end" className="ins-tick">{v}</text>
            </g>
          ))}
          {weeks.map((w, k) =>
            k === n - 1 || (k % every === 0 && n - 1 - k >= every) ? (
              <text key={w.start} x={x(k)} y={H - 8} textAnchor={k === 0 ? 'start' : k === n - 1 ? 'end' : 'middle'} className="ins-tick">
                {w.label}
              </text>
            ) : null,
          )}
          <path d={`${line((w) => w.added)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} className="ins-area" />
          <path d={line((w) => w.added)} className="ins-line a" />
          <path d={line((w) => w.tasted)} className="ins-line b" />
          {endLabels && (
            <>
              <text x={x(n - 1) + 10} y={y(last.added) + 4} className="ins-end">Added {last.added}</text>
              <text x={x(n - 1) + 10} y={y(last.tasted) + 4} className="ins-end">Tasted {last.tasted}</text>
            </>
          )}
          <line x1={x(i)} x2={x(i)} y1={M.t} y2={y(0)} className="ins-cross" />
          <circle cx={x(i)} cy={y(cur.added)} r={4.5} className="ins-dot a" />
          <circle cx={x(i)} cy={y(cur.tasted)} r={4.5} className="ins-dot b" />
          <g transform={`translate(${tipX},${tipY})`} pointerEvents="none">
            <rect width={TIP_W} height={TIP_H} rx={12} className="ins-tip" />
            <text x={14} y={22} className="ins-tip-h">
              {cur.partial ? `Week of ${cur.label}, so far` : `Week of ${cur.label}`}
            </text>
            <line x1={14} x2={30} y1={41} y2={41} className="ins-line a" />
            <text x={40} y={46} className="ins-tip-v">{cur.added} <tspan>added</tspan></text>
            <line x1={14} x2={30} y1={60} y2={60} className="ins-line b" />
            <text x={40} y={65} className="ins-tip-v">{cur.tasted} <tspan>tasted</tspan></text>
          </g>
          {weeks.map((w, k) => (
            <rect
              key={w.start}
              x={x(k) - slot / 2}
              y={0}
              width={slot}
              height={H - M.b + 6}
              fill="transparent"
              onPointerEnter={() => setAt(k)}
              onPointerMove={() => setAt(k)}
            />
          ))}
        </svg>
      </div>

      {table && (
        <table className="ins-table" aria-label="Weekly activity as a table">
          <thead>
            <tr><th>Week of</th><th>Added</th><th>Tasted</th></tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.start}>
                <td>{w.partial ? `${w.label} (so far)` : w.label}</td>
                <td>{w.added}</td>
                <td>{w.tasted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
