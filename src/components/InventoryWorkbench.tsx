"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { STATUSES, STATUS_LABELS, formatMoney } from "@/lib/constants";
import { errorMessage, fetchJson, jsonRequest } from "@/lib/client-api";
import Icon from "./Icon";
import StatusBadge from "./StatusBadge";

type InventoryRow = {
  id: string; name: string; sku: string; quantity: number; status: string;
  categoryName: string | null; locationName: string | null; listPrice: number | null;
  lowStockThreshold: number | null; brand: string | null; partNumber: string | null;
  tags: string | null; photoId: string | null; photoCount: number;
};

function isLow(item: InventoryRow) {
  return (item.status === "IN_STOCK" || item.status === "LISTED") &&
    item.lowStockThreshold !== null && item.quantity <= item.lowStockThreshold;
}

function Thumbnail({ item, large = false }: { item: InventoryRow; large?: boolean }) {
  return item.photoId ? (
    // Local, re-encoded photos are served at their stored size.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/photos/${item.photoId}`} alt="" loading="lazy" className={large ? undefined : "item-thumb"} />
  ) : large ? <Icon name="box" width="36" height="36" /> :
    <span className="item-thumb"><Icon name="box" width="24" height="24" /></span>;
}

export default function InventoryWorkbench({
  items, locationNames, exportQuery, total,
}: { items: InventoryRow[]; locationNames: string[]; exportQuery: string; total: number }) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [moving, setMoving] = useState(false);
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const allRef = useRef<HTMLInputElement>(null);
  const allSelected = selected.length === items.length;

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = selected.length > 0 && !allSelected;
  }, [allSelected, selected.length]);

  function toggle(id: string) {
    setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  }

  async function bulkUpdate(changes: { status?: string; locationName?: string }) {
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const result = await fetchJson<{ count: number }>("/api/items/bulk", jsonRequest("POST", { ids: selected, ...changes }));
      setMessage(`Updated ${result.count} ${result.count === 1 ? "item" : "items"}.`);
      setSelected([]);
      setStatus("");
      setMoving(false);
      router.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const selectedQuery = new URLSearchParams({ ids: selected.join(",") });
  const exportHref = selected.length ? `/api/export?format=csv&${selectedQuery}` : `/api/export?format=csv&${exportQuery}`;

  return (
    <div aria-busy={busy}>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {message && <p className="notice" role="status">{message}</p>}
      <div className="workbench-toolbar">
        <span>{total} {total === 1 ? "item" : "items"} in this view</span>
        <div className="actions">
          <a href={exportHref} className="button button-small button-quiet"><Icon name="download" />Export CSV</a>
          <div className="view-switch" role="group" aria-label="Inventory layout">
            <button className="button button-small icon-button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><Icon name="list" /></button>
            <button className="button button-small icon-button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Icon name="grid" /></button>
          </div>
        </div>
      </div>
      {selected.length > 0 && (
        <div className="bulk-toolbar">
          <strong>{selected.length} selected</strong>
          <button className="button button-small button-quiet" onClick={() => setSelected([])} disabled={busy}>Clear selection</button>
          <Link className="button button-small" href={`/labels?${selectedQuery}`}><Icon name="print" />Print selected</Link>
          <button className="button button-small" onClick={() => setMoving(!moving)} disabled={busy}><Icon name="pin" />Move</button>
          <label htmlFor="bulk-status" className="sr-only">New status for selected items</label>
          <select id="bulk-status" className="input" value={status} onChange={(event) => setStatus(event.target.value)} disabled={busy}>
            <option value="">Change status</option>
            {STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
          </select>
          <button className="button button-primary button-small" disabled={!status || busy} onClick={() => bulkUpdate({ status })}>
            {busy ? "Updating..." : "Apply"}
          </button>
          {moving && <form className="bulk-move" onSubmit={(event) => { event.preventDefault(); void bulkUpdate({ locationName: location }); }}>
            <label htmlFor="bulk-location">Move to</label>
            <input id="bulk-location" list="bulk-locations" className="input" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Blank clears location" disabled={busy} maxLength={100} />
            <datalist id="bulk-locations">{locationNames.map((name) => <option key={name} value={name} />)}</datalist>
            <button className="button button-small" disabled={busy}>Save location</button>
          </form>}
        </div>
      )}

      <div className="inventory-table-wrap" hidden={view === "grid"}>
        <table className="inventory-table">
          <thead>
            <tr>
              <th><input ref={allRef} type="checkbox" aria-label="Select all items on this page" checked={allSelected} disabled={busy} onChange={() => setSelected(allSelected ? [] : items.map((item) => item.id))} /></th>
              <th scope="col">Item</th><th scope="col">Stock</th><th scope="col">Status</th>
              <th scope="col" className="optional-column">Location</th><th scope="col" className="text-right">Price / unit</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={selected.includes(item.id) ? "is-selected" : undefined}>
                <td><input type="checkbox" aria-label={`Select ${item.name}`} checked={selected.includes(item.id)} disabled={busy} onChange={() => toggle(item.id)} /></td>
                <td>
                  <div className="item-cell">
                    <Thumbnail item={item} />
                    <div>
                      <Link href={`/items/${item.id}`} className="item-name">{item.name}</Link>
                      <div className="item-subtitle"><span className="mono">{item.sku}</span>{item.categoryName && <span>{item.categoryName}</span>}{item.photoCount > 0 && <span aria-label={`${item.photoCount} photos`}><Icon name="camera" width="12" height="12" /></span>}</div>
                      {item.partNumber && <p className="item-tags">Part {item.partNumber}</p>}
                    </div>
                  </div>
                </td>
                <td><div className="numeric">{item.quantity.toLocaleString("en-US")}</div>{isLow(item) && <span className="low-stock"><Icon name="alert" width="12" height="12" />Low stock</span>}</td>
                <td><StatusBadge status={item.status} /></td>
                <td className="optional-column muted">{item.locationName ?? "Unassigned"}</td>
                <td className="text-right numeric">{formatMoney(item.listPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`inventory-cards${view === "grid" ? " is-grid" : ""}`}>
        {items.map((item) => (
          <article className={`inventory-card${selected.includes(item.id) ? " is-selected" : ""}`} key={item.id}>
            <div className="card-image">
              <Thumbnail item={item} large />
              <label><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} disabled={busy} /><span className="sr-only">Select {item.name}</span></label>
            </div>
            <div className="card-body">
              <StatusBadge status={item.status} />
              <Link href={`/items/${item.id}`} className="item-name">{item.name}</Link>
              <p className="item-subtitle mono">{item.sku}</p>
              <p className="item-subtitle"><Icon name="pin" width="12" height="12" />{item.locationName ?? "No location yet"}</p>
              <div className="card-bottom"><span>{item.quantity} {item.quantity === 1 ? "unit" : "units"} {isLow(item) && <span className="low-stock">/ low</span>}</span><span className="numeric">{formatMoney(item.listPrice)}</span></div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
