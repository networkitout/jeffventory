"use client";

import { useState } from "react";
import Icon from "./Icon";

export default function PrintButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function print() {
    setBusy(true);
    setError("");
    try {
      const images = Array.from(document.querySelectorAll<HTMLImageElement>(".label-grid img"));
      await Promise.all(images.map((image) => image.decode()));
      window.print();
    } catch {
      setError("A code image could not load. Reload this page before printing so your labels stay scannable.");
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <button type="button" onClick={print} className="button button-primary" disabled={busy}><Icon name="print" />{busy ? "Preparing labels..." : "Print labels"}</button>
    {error && <p className="notice notice-error mt-3" role="alert">{error}</p>}
  </div>;
}
