"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATUSES, STATUS_LABELS, CONDITIONS, CONDITION_LABELS } from "@/lib/constants";

export type ItemFormValues = {
  id?: string;
  sku?: string;
  name?: string;
  description?: string | null;
  quantity?: number;
  upc?: string | null;
  condition?: string;
  status?: string;
  purchasePrice?: number | null;
  listPrice?: number | null;
  ebayUrl?: string | null;
  notes?: string | null;
  categoryName?: string;
  locationName?: string;
};

type Props = {
  mode: "create" | "edit";
  initial?: ItemFormValues;
  categoryNames: string[];
  locationNames: string[];
};

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-500 focus:border-emerald-600 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400";

export default function ItemForm({ mode, initial = {}, categoryNames, locationNames }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());

    const res = await fetch(mode === "create" ? "/api/items" : `/api/items/${initial.id}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Save failed (${res.status})`);
      setSaving(false);
      return;
    }

    const item = await res.json();
    router.push(`/items/${item.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
      {error && (
        <p className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <div>
        <label className={labelCls} htmlFor="name">
          Name *
        </label>
        <input id="name" name="name" required defaultValue={initial.name ?? ""} className={inputCls} placeholder="Raspberry Pi 4 Model B (4GB)" />
      </div>

      <div>
        <label className={labelCls} htmlFor="description">
          Description
        </label>
        <textarea id="description" name="description" rows={2} defaultValue={initial.description ?? ""} className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="sku">
            SKU
          </label>
          <input
            id="sku"
            name="sku"
            defaultValue={initial.sku ?? ""}
            className={`${inputCls} font-mono`}
            placeholder={mode === "create" ? "auto-generated" : ""}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="upc">
            UPC / EAN
          </label>
          <input id="upc" name="upc" inputMode="numeric" defaultValue={initial.upc ?? ""} className={`${inputCls} font-mono`} placeholder="Scanned product barcode" />
        </div>
        <div>
          <label className={labelCls} htmlFor="quantity">
            Quantity
          </label>
          <input id="quantity" name="quantity" type="number" min={0} defaultValue={initial.quantity ?? 1} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={initial.status ?? "IN_STOCK"} className={inputCls}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="condition">
            Condition
          </label>
          <select id="condition" name="condition" defaultValue={initial.condition ?? "USED"} className={inputCls}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor="categoryName">
            Category
          </label>
          <input id="categoryName" name="categoryName" list="category-options" defaultValue={initial.categoryName ?? ""} className={inputCls} placeholder="Electronics" />
          <datalist id="category-options">
            {categoryNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={labelCls} htmlFor="locationName">
            Location
          </label>
          <input id="locationName" name="locationName" list="location-options" defaultValue={initial.locationName ?? ""} className={inputCls} placeholder="Shelf A1" />
          <datalist id="location-options">
            {locationNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="purchasePrice">
            Purchase price ($)
          </label>
          <input id="purchasePrice" name="purchasePrice" type="number" step="0.01" min={0} defaultValue={initial.purchasePrice ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="listPrice">
            List price ($)
          </label>
          <input id="listPrice" name="listPrice" type="number" step="0.01" min={0} defaultValue={initial.listPrice ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="ebayUrl">
            eBay listing URL
          </label>
          <input id="ebayUrl" name="ebayUrl" type="url" defaultValue={initial.ebayUrl ?? ""} className={inputCls} placeholder="https://www.ebay.com/itm/…" />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="notes">
          Notes
        </label>
        <textarea id="notes" name="notes" rows={3} defaultValue={initial.notes ?? ""} className={inputCls} />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : mode === "create" ? "Create item" : "Save changes"}
        </button>
        <button type="button" onClick={() => router.back()} className="text-sm text-zinc-400 hover:text-zinc-100">
          Cancel
        </button>
      </div>
    </form>
  );
}
