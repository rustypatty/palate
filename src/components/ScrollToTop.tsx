import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { underlay } from './overlay';

/** New pages start at the top; going back keeps the browser's restored position. */
export function ScrollToTop() {
  // Opening or closing an overlay keeps the page underneath where it was.
  const { pathname } = underlay(useLocation());
  const type = useNavigationType();
  useEffect(() => {
    if (type !== 'POP') window.scrollTo(0, 0);
  }, [pathname, type]);
  return null;
}
