import { useEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet';

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

export function barcodeScanSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
}

/** Live camera barcode scanning using the browser's built-in BarcodeDetector. */
export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
    const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (stopped || done.current) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue && !done.current) {
              done.current = true;
              navigator.vibrate?.(40);
              onDetected(codes[0].rawValue);
              return;
            }
          } catch {
            /* frame not ready */
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError('Camera unavailable. Allow camera access, or type the barcode number instead.');
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <Sheet title="Scan barcode" onClose={onClose}>
      {error ? (
        <div className="callout">{error}</div>
      ) : (
        <div className="scanner">
          <video ref={videoRef} muted playsInline />
          <div className="reticle" />
        </div>
      )}
      <p className="muted small" style={{ marginTop: 12 }}>
        Point at the barcode on the back label. Bottles you’ve saved with a barcode open instantly.
      </p>
    </Sheet>
  );
}
