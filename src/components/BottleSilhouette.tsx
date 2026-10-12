/** The bottle silhouette, on its own so pages outside the app (the shared list) can use it. */

/** No photo: a minimal bottle silhouette standing in the tile. */
export function BottlePlaceholder(_props: { size?: number } = {}) {
  return (
    <div className="bottle-placeholder" aria-hidden="true">
      <BottleSilhouette />
    </div>
  );
}

export function BottleSilhouette() {
  return (
    <svg viewBox="0 0 40 140" aria-hidden="true">
      <path d="M16 2h8v36c0 7 11 12 11 25v70a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V63c0-13 11-18 11-25z" fill="#e6dcd3" stroke="#d6c9bb" strokeWidth="0.8" />
      <rect x="5.4" y="84" width="29.2" height="26" fill="#efe8df" />
    </svg>
  );
}
