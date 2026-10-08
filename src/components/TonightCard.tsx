import { Link, useLocation } from 'react-router-dom';

/** "Tonight →" on the Collection screen, when there's at least one bottle at home. */
export function TonightCard() {
  const location = useLocation();
  return (
    <Link to="/tonight" state={{ background: location }} className="tonight-card lift">
      <span className="tonight-card-text">
        <span className="eyebrow">Open from your cellar</span>
        <strong>
          What are you <em>cooking?</em>
        </strong>
      </span>
      <span className="btn btn-wine tonight-pill">Tonight →</span>
    </Link>
  );
}
