import { Bookmark, LayoutGrid, Plus, Store, Wine } from 'lucide-react';
import { Link, matchPath, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLists } from '../hooks';

export function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label="Palate home">
      Palate<span className="dot" aria-hidden="true" />
    </Link>
  );
}

/** How many bottles are on the Want to try list (for the count badges). */
export function useWantCount(): number {
  return useLists()?.want.length ?? 0;
}

export function Layout() {
  const location = useLocation();
  const wantCount = useWantCount();
  // Add/Edit wine has its own sticky Save bar instead of the navigation.
  const editing = Boolean(matchPath('/add', location.pathname) || matchPath('/wine/:id/edit', location.pathname));

  return (
    <div className={`app${editing ? ' no-nav' : ''}`}>
      <header className="topnav">
        <div className="topnav-inner">
          <Wordmark />
          <nav aria-label="Main">
            <NavLink to="/" end>
              Collection
            </NavLink>
            <NavLink to="/store">In store</NavLink>
            <NavLink to="/profile">My palate</NavLink>
          </nav>
          <span className="spacer" />
          <NavLink to="/want" className="want-pill">
            <Bookmark size={17} /> Want to try
            {wantCount > 0 && (
              <span key={wantCount} className="count-badge">
                {wantCount}
              </span>
            )}
          </NavLink>
          <Link to="/add" className="btn btn-wine add-pill">
            <Plus size={18} /> Add wine
          </Link>
        </div>
      </header>

      <main className="main">
        {/* Keyed by page so each screen arrives with a soft crossfade. */}
        <div className="route" key={location.pathname}>
          <Outlet />
        </div>
      </main>

      {!editing && (
        <nav className="bottomnav" aria-label="Main">
          <div className="tabs">
            <NavLink to="/" end>
              <LayoutGrid size={20} strokeWidth={1.7} />
              Collection
            </NavLink>
            <NavLink to="/store">
              <Store size={20} strokeWidth={1.7} />
              In store
            </NavLink>
            <NavLink to="/profile">
              <Wine size={20} strokeWidth={1.7} />
              My palate
            </NavLink>
          </div>
          <Link to="/add" className="fab" aria-label="Add wine">
            <Plus size={26} strokeWidth={1.8} />
          </Link>
        </nav>
      )}
    </div>
  );
}
