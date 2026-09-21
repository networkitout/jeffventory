"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUSES, STATUS_LABELS } from "@/lib/constants";
import { errorMessage, fetchJson, jsonRequest } from "@/lib/client-api";
import Icon from "./Icon";

export default function StockControl({ id, initialQuantity, initialStatus, lowStockThreshold }: {
  id: string; initialQuantity: number; initialStatus: string; lowStockThreshold: number | null;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(initialQuantity);
  const [status, setStatus] = useState(initialStatus);
  const [savedStatus, setSavedStatus] = useState(initialStatus);
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const low = lowStockThreshold !== null && quantity <= lowStockThreshold &&
    (savedStatus === "IN_STOCK" || savedStatus === "LISTED");

  async function adjust(direction: 1 | -1) {
    const units = Number(amount);
    setError("");
    setMessage("");
    if (!Number.isSafeInteger(units) || units < 1 || units > 1000000000) {
      setError("Enter a whole-number adjustment between 1 and 1,000,000,000.");
      return;
    }
    setBusy(true);
    try {
      const item = await fetchJson<{ quantity: number }>(`/api/items/${id}/quantity`,
        jsonRequest("POST", { delta: direction * units, note }));
      setQuantity(item.quantity);
      setNote("");
      setMessage(`Stock updated to ${item.quantity} ${item.quantity === 1 ? "unit" : "units"}.`);
      router.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveStatus() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const item = await fetchJson<{ status: string }>(`/api/items/${id}`, jsonRequest("PATCH", { status }));
      setSavedStatus(item.status);
      setMessage("Inventory status updated.");
      router.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div aria-busy={busy}>
      {error && <p role="alert" className="notice notice-error">{error}</p>}
      <div className="stock-control">
        <output aria-label="Current quantity">{quantity}</output><span className="muted">{quantity === 1 ? "unit" : "units"}</span>
        <span className="muted ml-auto text-xs">Adjust by</span>
        <label htmlFor="stock-amount" className="sr-only">Stock adjustment amount</label>
        <input id="stock-amount" type="number" min={1} max={1000000000} step={1} className="input" value={amount} disabled={busy} onChange={(event) => setAmount(event.target.value)} />
        <button className="button icon-button" aria-label="Decrease quantity" disabled={busy || quantity === 0} onClick={() => adjust(-1)}><Icon name="minus" /></button>
        <button className="button icon-button" aria-label="Increase quantity" disabled={busy} onClick={() => adjust(1)}><Icon name="plus" /></button>
      </div>
      <div className="mt-3">
        <label htmlFor="stock-note" className="sr-only">Adjustment note</label>
        <input id="stock-note" className="input" placeholder="Reason for adjustment (optional)" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} />
      </div>
      <div className="stock-metadata">
        {lowStockThreshold !== null && <span className={low ? "low-stock" : "muted text-xs"}>
          <Icon name={low ? "alert" : "box"} width="14" height="14" />
          Alert at {lowStockThreshold} units
        </span>}
        <span className="muted text-xs">Every adjustment is recorded below.</span>
      </div>
      <div className="actions mt-5">
        <label className="field-label mb-0!" htmlFor="quick-status">Status</label>
        <select id="quick-status" value={status} className="input" disabled={busy} onChange={(event) => setStatus(event.target.value)}>
          {STATUSES.map((value) => <option value={value} key={value}>{STATUS_LABELS[value]}</option>)}
        </select>
        <button className="button button-small" disabled={busy || status === savedStatus} onClick={saveStatus}>Save status</button>
      </div>
      <p className="field-hint">Status applies to this whole record. Marking it sold does not change its quantity.</p>
      {message && <p className="mt-3 text-sm text-emerald-200" role="status">{message}</p>}
    </div>
  );
}
