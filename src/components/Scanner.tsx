"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

export default function Scanner({ onDecode, paused = false }: { onDecode: (text: string) => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDecodeRef = useRef(onDecode);
  const pausedRef = useRef(paused);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { onDecodeRef.current = onDecode; pausedRef.current = paused; }, [onDecode, paused]);

  useEffect(() => {
    let cancelled = false;
    let controls: IScannerControls | undefined;
    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 180,
      delayBetweenScanSuccess: 900,
    });
    const video = videoRef.current;

    async function start() {
      setError("");
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera scanning needs HTTPS or localhost. You can enter a code or scan a photo instead.");
        }
        if (!video) throw new Error("The camera preview is unavailable. Try again.");
        const nextControls = await reader.decodeFromConstraints({
          audio: false,
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } },
        }, video, (result) => {
          if (!cancelled && result && !pausedRef.current) onDecodeRef.current(result.getText());
        });
        if (cancelled) { nextControls.stop(); return; }
        controls = nextControls;
        const found = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!cancelled) setDevices(found);
      } catch (error) {
        controls?.stop();
        if (cancelled) return;
        const name = error instanceof Error ? error.name : "";
        setError(name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in your browser and try again, or enter a code below."
          : name === "NotFoundError" ? "No camera was found. Connect a camera, enter a code, or scan a photo."
          : name === "NotReadableError" ? "Another app may be using the camera. Close it and try again."
          : error instanceof Error ? `Could not start the camera: ${error.message}. Enter a code or scan a photo instead.`
          : "The camera could not start. Try again or enter the code manually.");
      }
    }
    void start();
    return () => { cancelled = true; controls?.stop(); };
  }, [deviceId, attempt]);

  return (
    <div>
      <video ref={videoRef} className="scanner-video" muted playsInline aria-label="Camera barcode preview" />
      {error && <div className="notice notice-error mt-3" role="alert">
        <p>{error}</p><button type="button" className="button button-small mt-3" onClick={() => setAttempt((value) => value + 1)}>Retry camera</button>
      </div>}
      {devices.length > 1 && <div className="scanner-controls">
        <label className="field-label mb-0!" htmlFor="camera-device">Camera</label>
        <select id="camera-device" className="input" value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
          <option value="">Rear / default camera</option>
          {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
        </select>
      </div>}
    </div>
  );
}
