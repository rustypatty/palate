import { Globe, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isCameraPhoto, photoFromUrl, shownPhoto } from '../lib/image';
import type { Photo } from '../types';
import { BottleImage } from './BottleImage';
import { ImageSearchSheet, type ExpectedWine } from './ImageSearchSheet';
import { useToast } from './Toast';

/** The bottle's photo: always one found on the web (camera photos are never kept). */
export function PhotoPicker({
  photo,
  onChange,
  expected,
  autoSearch = false,
  openSearch = 0,
}: {
  autoSearch?: boolean;
  /** Change this to open the web search (e.g. when the label check found no photo). */
  openSearch?: number;
  photo: Photo | null;
  onChange: (p: Photo | null) => void;
  expected: ExpectedWine;
}) {
  const [searching, setSearching] = useState(autoSearch);
  const toast = useToast();
  useEffect(() => {
    if (openSearch) setSearching(true);
  }, [openSearch]);

  const query = [expected.producer, expected.name, typeof expected.vintage === 'number' ? expected.vintage : ''].filter(Boolean).join(' ');
  const web = shownPhoto(photo);

  return (
    <div className="photo-picker">
      <div className="tile">
        <BottleImage photo={photo} alt="Bottle photo" eager />
      </div>
      <div className="actions">
        <button type="button" className="btn btn-tone" onClick={() => setSearching(true)}>
          <Globe size={18} /> {web ? 'Find a better photo' : 'Find a photo online'}
        </button>
        {web && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => onChange(null)}>
            <Trash2 size={16} /> Remove photo
          </button>
        )}
        {isCameraPhoto(photo) ? (
          <span className="photo-source">Your own photos aren’t used — pick this bottle from the web.</span>
        ) : (
          web?.source && (
            <span className="photo-source">
              Source:{' '}
              {web.source.pageUrl ? (
                <a href={web.source.pageUrl} target="_blank" rel="noreferrer">
                  {web.source.name}
                </a>
              ) : (
                web.source.name
              )}
            </span>
          )
        )}
      </div>
      {searching && (
        <ImageSearchSheet
          initialQuery={query}
          expected={expected}
          onClose={() => setSearching(false)}
          onChoose={async (img) => {
            const p = await photoFromUrl(img.url, { name: img.sourceName, pageUrl: img.pageUrl, title: img.title });
            onChange(p);
            toast(p.kind === 'local' ? 'Photo saved to your device' : 'Photo linked from the web');
          }}
        />
      )}
    </div>
  );
}
