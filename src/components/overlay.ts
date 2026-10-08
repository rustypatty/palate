import type { Location } from 'react-router-dom';

/** Screens that open over another page: full screen on a phone, a centred panel on a computer. */
export const OVERLAYS = ['/tonight'];

/** The page shown underneath an overlay: where it was opened from, else the home screen. */
export function underlay(location: Location): Location {
  if (!OVERLAYS.includes(location.pathname)) return location;
  const from = (location.state as { background?: Location } | null)?.background;
  return from ?? { ...location, pathname: '/', search: '', hash: '', state: null };
}
