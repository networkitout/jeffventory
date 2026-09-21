"use client";

import { useRef, useState } from "react";
import Icon from "./Icon";

export default function PhotoPicker({
  files, onChange, existingCount = 0, disabled = false, idPrefix = "item",
}: { files: File[]; onChange: (files: File[]) => void; existingCount?: number; disabled?: boolean; idPrefix?: string }) {
  const chooseRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  function addFiles(incoming: File[]) {
    setError("");
    if (disabled) return;
    if (incoming.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setError("Choose JPEG, PNG, or WebP photos. Convert HEIC images before uploading.");
      return;
    }
    if (incoming.some((file) => file.size > 10 * 1024 * 1024)) {
      setError("Each photo must be 10 MB or smaller.");
      return;
    }
    const next = [...files];
    for (const file of incoming) {
      if (!next.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) next.push(file);
    }
    if (next.length + existingCount > 8) {
      setError(`An item can have up to 8 photos. You have room for ${Math.max(0, 8 - existingCount - files.length)} more.`);
      return;
    }
    onChange(next);
  }

  return (
    <div>
      {error && <p role="alert" className="notice notice-error">{error}</p>}
      <div className="upload-area" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault();
        addFiles(Array.from(event.dataTransfer.files));
      }}>
        <input id={`${idPrefix}-photos`} ref={chooseRef} type="file" multiple accept="image/jpeg,image/png,image/webp"
          aria-label="Choose item photos" className="hidden" disabled={disabled}
          onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
          aria-label="Take an item photo" className="hidden" disabled={disabled}
          onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <div className="actions">
          <button type="button" className="button button-small" disabled={disabled || existingCount + files.length >= 8}
            onClick={() => chooseRef.current?.click()}><Icon name="upload" />Choose photos</button>
          <button type="button" className="button button-small" disabled={disabled || existingCount + files.length >= 8}
            onClick={() => cameraRef.current?.click()}><Icon name="camera" />Take photo</button>
        </div>
        <p>Or drop photos here. JPEG, PNG, WebP &middot; up to 10 MB each &middot; 8 per item.</p>
      </div>
      {files.length > 0 && <ul className="file-list" aria-label="Photos waiting to upload">
        {files.map((file, index) => <li key={`${file.name}-${file.size}-${index}`}>
          <Icon name="camera" /><span>{file.name} <span className="muted">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></span>
          <button type="button" className="button button-small icon-button" aria-label={`Remove ${file.name}`} disabled={disabled}
            onClick={() => onChange(files.filter((_, photoIndex) => index !== photoIndex))}><Icon name="close" /></button>
        </li>)}
      </ul>}
    </div>
  );
}
