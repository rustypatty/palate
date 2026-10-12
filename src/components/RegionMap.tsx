import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { RegionPlace } from '../lib/regionPlaces';

/**
 * A small, still map of where a wine region is: the country and its neighbours drawn from the
 * Natural Earth atlas that ships with the app (no tiles, no keys, no images), a burgundy marker
 * with the region's name, and a few big cities nearby to get your bearings.
 */

const HEIGHT = 250;
const SPAN = 4; // degrees either side of the region
const SEA = '#e9e1d6';
const WINE = '#7a1f35';
const FONT = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, system-ui, sans-serif";

type Country = Feature<Geometry, { name: string }>;
let atlas: Promise<Country[]> | null = null;

/** The countries, loaded once (a ~100 KB chunk) and kept for every map after the first. */
function loadAtlas(): Promise<Country[]> {
  atlas ??= Promise.all([import('world-atlas/countries-110m.json'), import('topojson-client')]).then(([topo, { feature }]) => {
    const t = topo.default;
    return (feature(t, t.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>).features;
  });
  atlas.catch(() => {
    atlas = null; // try again next time rather than staying empty
  });
  return atlas;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const textWidth = (s: string, px: number) => s.length * px * 0.56;

export default function RegionMap({ place, name }: { place: RegionPlace; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(358);
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth || 358);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    loadAtlas().then(
      (c) => live && setCountries(c),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const drawn = useMemo(() => {
    if (!countries) return null;
    const { lat, lng } = place;
    // Fit a box about ±4° around the region into the card.
    const unit = geoMercator().scale(1).translate([0, 0]);
    const [x0, y0] = unit([lng - SPAN, lat + SPAN])!;
    const [x1, y1] = unit([lng + SPAN, lat - SPAN])!;
    const k = Math.min(width / (x1 - x0), HEIGHT / (y1 - y0));
    const proj = geoMercator()
      .scale(k)
      .translate([width / 2 - (k * (x0 + x1)) / 2, HEIGHT / 2 - (k * (y0 + y1)) / 2]);
    const path = geoPath(proj);
    const near: { d: string; home: boolean; id: string }[] = [];
    for (const c of countries) {
      const [[bx0, by0], [bx1, by1]] = path.bounds(c);
      if (!(bx1 >= 0 && bx0 <= width && by1 >= 0 && by0 <= HEIGHT)) continue;
      const d = path(c);
      if (d) near.push({ d, home: c.properties.name === place.country, id: c.properties.name });
    }
    near.sort((a, b) => Number(a.home) - Number(b.home)); // home country on top of its borders
    const [mx, my] = proj([lng, lat])!;

    // Region label (above the marker) and the country pill (bottom left) come first; cities fill in around them.
    const labelW = textWidth(name, 12) + 22;
    const labelX = Math.min(Math.max(mx - labelW / 2, 8), width - labelW - 8);
    const label: Box = { x: labelX, y: my - 16 - 6 - 24, w: labelW, h: 24 };
    const countryName = place.country === 'United States of America' ? 'United States' : place.country;
    const pillW = textWidth(countryName, 11) + 20;
    const pill: Box = { x: 10, y: HEIGHT - 10 - 22, w: pillW, h: 22 };
    const taken: Box[] = [label, pill, { x: mx - 17, y: my - 17, w: 34, h: 34 }];
    const cities: { name: string; x: number; y: number; left: boolean }[] = [];
    for (const c of place.cities) {
      if (cities.length >= 4) break;
      const [x, y] = proj([c.lng, c.lat])!;
      const w = textWidth(c.name, 11);
      const dot: Box = { x: x - 3, y: y - 3, w: 6, h: 6 };
      if (x < 6 || y < 6 || y > HEIGHT - 6) continue;
      // Label on the right of the dot, or on the left when that doesn't fit or clashes.
      const sides = [false, true].map((left) => ({ left, lb: { x: left ? x - 6 - w : x + 6, y: y - 7, w, h: 14 } }));
      const side = sides.find(({ lb }) => lb.x >= 6 && lb.x + lb.w <= width - 6 && ![dot, lb].some((b) => taken.some((t) => hits(b, t))));
      if (!side) continue;
      taken.push(side.lb, dot);
      const left = side.left;
      cities.push({ name: c.name, x, y, left });
    }
    return { near, mx, my, label, pill, countryName, cities };
  }, [countries, place, name, width]);

  if (failed) return null;

  return (
    <div ref={box} className="region-map" style={{ height: HEIGHT, background: SEA }}>
      {drawn && (
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={`Map: ${name}, ${drawn.countryName}`}>
          {drawn.near.map((c) => (
            <path key={c.id} d={c.d} fill={c.home ? '#fff' : '#f4f0ea'} stroke={c.home ? '#cfc4b6' : '#ddd3c6'} strokeWidth={1} strokeLinejoin="round" />
          ))}
          {drawn.cities.map((c) => (
            <g key={c.name}>
              <circle cx={c.x} cy={c.y} r={2.6} fill="#a59b90" />
              <text x={c.left ? c.x - 6 : c.x + 6} y={c.y + 3.5} textAnchor={c.left ? 'end' : 'start'} fontFamily={FONT} fontSize={11} fill="#8f877f">
                {c.name}
              </text>
            </g>
          ))}
          <circle cx={drawn.mx} cy={drawn.my} r={16} fill={WINE} opacity={0.14} />
          <circle cx={drawn.mx} cy={drawn.my} r={6} fill={WINE} stroke="#fff" strokeWidth={2} />
          <rect x={drawn.label.x} y={drawn.label.y} width={drawn.label.w} height={drawn.label.h} rx={12} fill={WINE} />
          <text x={drawn.label.x + drawn.label.w / 2} y={drawn.label.y + 16} textAnchor="middle" fontFamily={FONT} fontSize={12} fontWeight={600} fill="#fff">
            {name}
          </text>
          <rect x={drawn.pill.x} y={drawn.pill.y} width={drawn.pill.w} height={drawn.pill.h} rx={11} fill="#fff" />
          <text x={drawn.pill.x + drawn.pill.w / 2} y={drawn.pill.y + 15} textAnchor="middle" fontFamily={FONT} fontSize={11} fontWeight={600} fill="#5b534c">
            {drawn.countryName}
          </text>
        </svg>
      )}
    </div>
  );
}
