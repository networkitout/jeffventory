"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

type Props = {
  onDecode: (text: string) => void;
  paused?: boolean;
};

export default function Scanner({ onDecode, paused = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // Keep the latest callback in refs so the camera doesn't restart on each render.
  const onDecodeRef = useRef(onDecode);
  const pausedRef = useRef(paused);
  useEffect(() => {
    onDecodeRef.current = onDecode;
    pausedRef.current = paused;
  });

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    async function start() {
      setError(null);
      try {
        const controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current!, (result) => {
          if (result && !pausedRef.current) {
            onDecodeRef.current(result.getText());
          }
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;

        const found = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!cancelled) setDevices(found);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error && e.name === "NotAllowedError"
              ? "Camera access denied. Allow camera permissions and reload."
              : `Could not start camera: ${e instanceof Error ? e.message : "unknown error"}`
          );
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [deviceId, stop]);

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : (
        <video
          ref={videoRef}
          className="aspect-video w-full rounded-lg border border-zinc-700 bg-black object-cover"
          muted
          playsInline
        />
      )}
      {devices.length > 1 && (
        <select
          value={deviceId ?? ""}
          onChange={(e) => setDeviceId(e.target.value || undefined)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
        >
          <option value="">Default camera</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
