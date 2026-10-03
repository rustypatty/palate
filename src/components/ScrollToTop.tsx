import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** New pages start at the top; going back keeps the browser's restored position. */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    if (type !== 'POP') window.scrollTo(0, 0);
  }, [pathname, type]);
  return null;
}
