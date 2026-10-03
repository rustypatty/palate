/**
 * Barcode reading that works on every phone. Chrome/Android ship a native
 * BarcodeDetector; Safari on iPhone doesn't, so there we lazy-load a
 * WebAssembly build of ZXing (served with the app, so it also works offline).
 */

export interface Detector {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

let detectorPromise: Promise<Detector> | null = null;

async function nativeDetector(): Promise<Detector | null> {
  const Native = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } })
    .BarcodeDetector;
  if (!Native) return null;
  try {
    const supported = (await Native.getSupportedFormats?.()) ?? [];
    if (!supported.includes('ean_13')) return null;
    return new Native({ formats: [...FORMATS] });
  } catch {
    return null;
  }
}

async function wasmDetector(): Promise<Detector> {
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
    fireImmediately: true,
  });
  return new BarcodeDetector({ formats: [...FORMATS] });
}

export function getDetector(): Promise<Detector> {
  detectorPromise ??= nativeDetector().then((d) => d ?? wasmDetector());
  detectorPromise.catch(() => (detectorPromise = null));
  return detectorPromise;
}

export function cameraAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Read a barcode from a still photo (e.g. one taken of the back label). */
export async function readBarcodeFromImage(file: Blob): Promise<string | null> {
  const detector = await getDetector();
  const bitmap = await createImageBitmap(file);
  try {
    const codes = await detector.detect(bitmap);
    return codes[0]?.rawValue ?? null;
  } finally {
    bitmap.close();
  }
}
