import { GlassWater, Plus, ScanLine, Search, User } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

export function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label="Palate home">
      Palate<span className="dot" aria-hidden="true" />
    </Link>
  );
}

export function Layout() {
  const navigate = useNavigate();
  const focusSearch = () => navigate('/', { state: { focusSearch: Date.now() } });

  return (
    <div className="app">
      <header className="topnav">
        <div className="topnav-inner">
          <Wordmark />
          <nav aria-label="Main">
            <NavLink to="/" end>
              My wines
            </NavLink>
            <NavLink to="/store">In store</NavLink>
            <NavLink to="/profile">My palate</NavLink>
          </nav>
          <span className="spacer" />
          <button type="button" className="icon-btn" onClick={focusSearch} aria-label="Search wines">
            <Search size={20} />
          </button>
          <Link to="/add" className="btn btn-primary btn-sm">
            <Plus size={18} /> Add wine
          </Link>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <nav className="bottomnav" aria-label="Main">
        <NavLink to="/" end>
          <GlassWater size={22} />
          Wines
        </NavLink>
        <button type="button" onClick={focusSearch}>
          <Search size={22} />
          Search
        </button>
        <NavLink to="/add" className="fab" aria-label="Add wine">
          <Plus size={28} strokeWidth={2.4} />
        </NavLink>
        <NavLink to="/store">
          <ScanLine size={22} />
          In store
        </NavLink>
        <NavLink to="/profile">
          <User size={22} />
          Palate
        </NavLink>
      </nav>
    </div>
  );
}
