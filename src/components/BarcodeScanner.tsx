import { Camera } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cameraAvailable, getDetector, readBarcodeFromImage } from '../lib/barcode';
import { Sheet } from './Sheet';

/** Live camera barcode scanning, with "take a photo" as a fallback. */
export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(cameraAvailable() ? null : 'Live scanning isn’t available in this browser.');
  const [status, setStatus] = useState<string | null>(null);
  const done = useRef(false);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const finish = (code: string) => {
    if (done.current) return;
    done.current = true;
    navigator.vibrate?.(40);
    onDetectedRef.current(code);
  };

  useEffect(() => {
    if (!cameraAvailable()) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;

    (async () => {
      try {
        const [detector, s] = await Promise.all([
          getDetector(),
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          }),
        ]);
        stream = s;
        if (stopped) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (stopped || done.current) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) return finish(codes[0].rawValue);
            }
          } catch {
            /* frame not ready */
          }
          // ~6 scans a second keeps the WebAssembly decoder from heating the phone.
          timer = window.setTimeout(tick, 160);
        };
        tick();
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        setError(denied ? 'Camera access was blocked. Allow it in your browser settings, or take a photo of the barcode instead.' : 'Couldn’t start the camera. Take a photo of the barcode instead.');
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setStatus('Reading barcode…');
    try {
      const code = await readBarcodeFromImage(file);
      if (code) finish(code);
      else setStatus('No barcode found in that photo. Get closer and keep it sharp, or type the name instead.');
    } catch {
      setStatus('Couldn’t read that photo.');
    }
  };

  return (
    <Sheet title="Scan barcode" onClose={onClose}>
      {error ? (
        <div className="callout">{error}</div>
      ) : (
        <div className="scanner">
          <video ref={videoRef} muted playsInline autoPlay />
          <div className="reticle" />
        </div>
      )}
      <p className="muted small" style={{ marginTop: 12 }}>
        Point at the barcode on the back label. Bottles you’ve saved with a barcode open instantly.
      </p>
      <button type="button" className="btn btn-outline btn-block" onClick={() => photoRef.current?.click()}>
        <Camera size={18} /> Take a photo of the barcode
      </button>
      {status && (
        <p className="small" role="status" style={{ marginBottom: 0 }}>
          {status}
        </p>
      )}
      <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (onPhoto(e.target.files?.[0]), (e.target.value = ''))} />
    </Sheet>
  );
}
