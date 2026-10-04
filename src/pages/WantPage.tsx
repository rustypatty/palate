import { ArrowLeft, Bookmark } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { WineCard } from '../components/WineCard';
import { useLists } from '../hooks';

export function WantPage() {
  const lists = useLists();
  const navigate = useNavigate();
  if (!lists) return null;
  return (
    <div>
      <div className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1>Want to try</h1>
            <p className="sub">
              {lists.want.length} {lists.want.length === 1 ? 'wine' : 'wines'} saved from suggestions
            </p>
          </div>
        </div>
      </div>
      {lists.want.length === 0 ? (
        <div className="empty">
          <div className="art">
            <Bookmark size={40} />
          </div>
          <h2>Nothing saved yet</h2>
          <p>Tap “Want to try” on a store pick and it’s kept here, on your phone and computer.</p>
          <div className="actions">
            <Link to="/store" className="btn btn-primary">
              See store picks
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid">
          {lists.want.map((w) => (
            <WineCard key={w.id} wine={w} />
          ))}
        </div>
      )}
    </div>
  );
}
