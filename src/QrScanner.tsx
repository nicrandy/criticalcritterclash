import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrScannerProps {
  onScan: (id: string) => void;
  onError?: (msg: string) => void;
}

export function QrScanner({ onScan, onError }: QrScannerProps) {
  const containerId = 'qr-scanner-container';
  const scannerRef  = useRef<Html5Qrcode | null>(null);
  const [started,  setStarted]  = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },   // rear camera
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        // Extract the last path segment as the critter ID
        // e.g. https://www.criticalcritterclash.com/E5RJRE95 → E5RJRE95
        const id = decodedText.trim().split('/').pop()?.toUpperCase() ?? '';
        if (id.length === 8) {
          scanner.stop().catch(() => {});
          onScan(id);
        }
      },
      () => { /* ignore per-frame failures */ }
    )
    .then(() => setStarted(true))
    .catch((err) => {
      const msg = typeof err === 'string' ? err : (err?.message ?? 'Camera unavailable.');
      setCamError(msg);
      onError?.(msg);
    });

    return () => {
      if (scanner.isScanning) scanner.stop().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="qr-scanner-wrap">
      {camError ? (
        <div className="qr-scanner-error">
          <p>📷 Camera error:</p>
          <p style={{ opacity: 0.7, fontSize: '0.8rem' }}>{camError}</p>
          <p style={{ opacity: 0.5, fontSize: '0.75rem', marginTop: '0.5rem' }}>
            Allow camera access in your browser settings and try again.
          </p>
        </div>
      ) : (
        <>
          {!started && (
            <div className="qr-scanner-loading">Starting camera…</div>
          )}
          <div id={containerId} className="qr-scanner-video" />
          {started && (
            <p className="qr-scanner-hint">Point at the QR code on your card</p>
          )}
        </>
      )}
    </div>
  );
}
