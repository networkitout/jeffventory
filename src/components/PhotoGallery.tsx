"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, fetchJson } from "@/lib/client-api";
import Icon from "./Icon";
import PhotoPicker from "./PhotoPicker";

export type PhotoData = { id: string; originalName: string; width: number; height: number };

export default function PhotoGallery({ itemId, itemName, initialPhotos }: { itemId: string; itemName: string; initialPhotos: PhotoData[] }) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedId, setSelectedId] = useState<string | null>(initialPhotos[0]?.id ?? null);
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const active = photos.find((photo) => photo.id === selectedId) ?? photos[0];

  async function upload() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      for (const file of files) body.append("files", file);
      const added = await fetchJson<PhotoData[]>(`/api/items/${itemId}/photos`, { method: "POST", body });
      setPhotos((current) => [...current, ...added]);
      setFiles([]);
      setMessage(`${added.length} ${added.length === 1 ? "photo" : "photos"} saved.`);
      setEditing(false);
      router.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (!active || !window.confirm("Delete this photo? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fetchJson(`/api/photos/${active.id}`, { method: "DELETE" });
      setPhotos((current) => current.filter((photo) => photo.id !== active.id));
      setMessage("Photo deleted.");
      router.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Item photos" aria-busy={busy}>
      <div className="photo-stage">
        {active ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photos/${active.id}`} alt={`${itemName}, photo ${photos.indexOf(active) + 1}`} width={active.width} height={active.height} />
        ) : (
          <div className="photo-placeholder"><Icon name="camera" width="44" height="44" /><h3>Put a face to this item</h3><p className="mt-2 text-sm">A photo makes a crowded shelf easier to search.</p></div>
        )}
      </div>
      {photos.length > 1 && <div className="photo-thumbs" role="group" aria-label="Choose a photo">
        {photos.map((photo, index) => <button type="button" key={photo.id} aria-label={`View photo ${index + 1}`} aria-pressed={photo.id === active?.id} onClick={() => setSelectedId(photo.id)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/photos/${photo.id}`} alt="" loading="lazy" width="60" height="60" />
        </button>)}
      </div>}
      <div className="photo-actions actions">
        <button className="button button-small" onClick={() => setEditing(!editing)} disabled={busy}>
          <Icon name="camera" />{editing ? "Close photo upload" : "Add photos"}
        </button>
        {active && <><a className="button button-small button-quiet" href={`/api/photos/${active.id}`} download={`${itemName.replace(/[^a-z0-9-]/gi, "-").slice(0, 70)}.webp`}><Icon name="download" />Download</a>
          <button className="button button-small button-quiet icon-button" aria-label="Delete selected photo" onClick={removePhoto} disabled={busy}><Icon name="trash" /></button></>}
        <span className="muted text-xs">{photos.length} / 8 photos</span>
      </div>
      {error && <p className="notice notice-error mt-4" role="alert">{error}</p>}
      {message && <p className="mt-3 text-xs muted" role="status">{message}</p>}
      {editing && <div className="mt-4">
        <PhotoPicker files={files} onChange={setFiles} existingCount={photos.length} disabled={busy} idPrefix="gallery" />
        {files.length > 0 && <button className="button button-primary mt-3" disabled={busy} onClick={upload}>{busy ? "Uploading..." : `Upload ${files.length} ${files.length === 1 ? "photo" : "photos"}`}</button>}
        <p className="field-hint">Saved on this computer. The first photo is used as the inventory thumbnail.</p>
      </div>}
    </section>
  );
}
