import { Camera, Globe, ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { photoFromFile, photoFromUrl } from '../lib/image';
import type { Photo } from '../types';
import { BottleImage } from './BottleImage';
import { ImageSearchSheet, type ExpectedWine } from './ImageSearchSheet';
import { useToast } from './Toast';

export function PhotoPicker({
  photo,
  onChange,
  expected,
}: {
  photo: Photo | null;
  onChange: (p: Photo | null) => void;
  expected: ExpectedWine;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const toast = useToast();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await photoFromFile(file, { name: 'Your photo' }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t use that photo');
    } finally {
      setBusy(false);
    }
  };

  const query = [expected.producer, expected.name, typeof expected.vintage === 'number' ? expected.vintage : ''].filter(Boolean).join(' ');

  return (
    <div className="photo-picker">
      <div className="tile">
        <BottleImage photo={photo} alt="Bottle photo" eager />
        {busy && <div className="busy">Processing…</div>}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-outline" onClick={() => cameraRef.current?.click()}>
          <Camera size={18} /> Take photo
        </button>
        <button type="button" className="btn btn-outline" onClick={() => libraryRef.current?.click()}>
          <ImagePlus size={18} /> Upload
        </button>
        <button type="button" className="btn btn-outline" onClick={() => setSearching(true)}>
          <Globe size={18} /> Find online
        </button>
        {photo && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => onChange(null)}>
            <Trash2 size={16} /> Remove photo
          </button>
        )}
        {photo?.source && (
          <span className="photo-source">
            Source:{' '}
            {photo.source.pageUrl ? (
              <a href={photo.source.pageUrl} target="_blank" rel="noreferrer">
                {photo.source.name}
              </a>
            ) : (
              photo.source.name
            )}
          </span>
        )}
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ''))} />
      <input ref={libraryRef} type="file" accept="image/*" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ''))} />
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
