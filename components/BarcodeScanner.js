'use client';

import { useEffect, useRef, useState } from 'react';

async function lookupBarcode(code) {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,nutriments,serving_size`
  );
  if (!res.ok) throw new Error('Lookup failed — check your connection and try again.');
  const data = await res.json();
  if (data.status !== 1 || !data.product) {
    throw new Error("Couldn't find that barcode in the food database. Try entering it manually below.");
  }

  const n = data.product.nutriments || {};
  const hasServing = n['energy-kcal_serving'] != null;
  const basis = hasServing ? '_serving' : '_100g';

  return {
    name: data.product.product_name || `Scanned item (${code})`,
    cal: n[`energy-kcal${basis}`] ?? 0,
    protein: n[`proteins${basis}`] ?? 0,
    carbs: n[`carbohydrates${basis}`] ?? 0,
    fat: n[`fat${basis}`] ?? 0,
    note: hasServing
      ? `per serving${data.product.serving_size ? ` (${data.product.serving_size})` : ''}`
      : 'per 100g — adjust the numbers below if your actual portion differs',
  };
}

/**
 * @param {(result: {name, cal, protein, carbs, fat, note}) => void} onFound
 */
export default function BarcodeScanner({ onFound, onClose }) {
  const videoRef = useRef(null);
  const [supportsCamera, setSupportsCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSupportsCamera(typeof window !== 'undefined' && 'BarcodeDetector' in window);
  }, []);

  useEffect(() => {
    if (!scanning) return;
    let stream;
    let stopped = false;
    let detector;
    let intervalId;

    async function start() {
      try {
        detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
        });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        intervalId = setInterval(async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              handleCode(codes[0].rawValue);
            }
          } catch {
            // transient detection errors are normal mid-scan; keep trying
          }
        }, 400);
      } catch (err) {
        setError('Could not access the camera (' + err.message + '). Use manual entry below instead.');
        setScanning(false);
      }
    }

    start();
    return () => {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [scanning]);

  async function handleCode(code) {
    setScanning(false);
    setLoading(true);
    setError(null);
    try {
      const result = await lookupBarcode(code);
      onFound(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await lookupBarcode(manualCode.trim());
      onFound(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-line rounded-card p-3 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Scan a barcode</p>
        <button type="button" onClick={onClose} className="text-xs text-ink/50 hover:underline">
          Close
        </button>
      </div>

      {supportsCamera && (
        <div>
          {!scanning ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setScanning(true);
              }}
              className="w-full bg-pine text-white rounded-card py-2 text-sm font-medium hover:bg-pineDark"
            >
              Open camera
            </button>
          ) : (
            <div className="space-y-2">
              <video ref={videoRef} className="w-full rounded-card bg-black" muted playsInline />
              <p className="text-xs text-ink/50 text-center">Point the camera at the barcode…</p>
              <button
                type="button"
                onClick={() => setScanning(false)}
                className="w-full border border-line rounded-card py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {!supportsCamera && (
        <p className="text-xs text-ink/50">
          Your browser doesn&apos;t support camera-based scanning (this is a Safari/iOS limitation) —
          type the barcode number instead.
        </p>
      )}

      <form onSubmit={handleManualSubmit} className="flex gap-2">
        <input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Or type the barcode number"
          inputMode="numeric"
          className="flex-1 border border-line rounded-card px-3 py-2 bg-card text-sm outline-none focus:border-pine"
        />
        <button
          type="submit"
          disabled={loading}
          className="border border-line rounded-card px-4 py-2 text-sm font-medium hover:bg-paper disabled:opacity-50"
        >
          {loading ? 'Looking up…' : 'Look up'}
        </button>
      </form>

      {error && <p className="text-sm text-rust">{error}</p>}
    </div>
  );
}
