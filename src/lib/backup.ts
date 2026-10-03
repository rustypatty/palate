import { db, type PalateDB } from '../db';
import type { StoredPhoto, Wine } from '../types';

interface BackupFile {
  app: 'palate';
  version: 1;
  exportedAt: string;
  wines: Wine[];
  photos: { id: string; width: number; height: number; type: string; data: string }[];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportBackup(database: PalateDB = db): Promise<Blob> {
  const wines = await database.wines.toArray();
  const photos = await database.photos.toArray();
  const file: BackupFile = {
    app: 'palate',
    version: 1,
    exportedAt: new Date().toISOString(),
    wines,
    photos: await Promise.all(
      photos.map(async (p) => ({ id: p.id, width: p.width, height: p.height, type: p.blob.type || 'image/jpeg', data: await blobToBase64(p.blob) })),
    ),
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** Merge a backup into the collection. Wines with the same id are replaced by the backup's copy. */
export async function importBackup(file: Blob, database: PalateDB = db): Promise<{ wines: number; photos: number }> {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('That file isn’t a Palate backup.');
  }
  if (parsed?.app !== 'palate' || !Array.isArray(parsed.wines)) throw new Error('That file isn’t a Palate backup.');
  const photos: StoredPhoto[] = (parsed.photos ?? []).map((p) => ({ id: p.id, width: p.width, height: p.height, blob: base64ToBlob(p.data, p.type) }));
  await database.transaction('rw', database.wines, database.photos, async () => {
    await database.photos.bulkPut(photos);
    await database.wines.bulkPut(parsed.wines);
  });
  return { wines: parsed.wines.length, photos: photos.length };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
