"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { STATUSES, STATUS_LABELS, CONDITIONS, CONDITION_LABELS } from "@/lib/constants";
import { errorMessage, fetchJson, jsonRequest } from "@/lib/client-api";
import Icon from "./Icon";
import PhotoPicker from "./PhotoPicker";

export type ItemFormValues = {
  id?: string; sku?: string; name?: string; description?: string | null;
  quantity?: number; upc?: string | null; condition?: string; status?: string;
  purchasePrice?: number | null; listPrice?: number | null; salePrice?: number | null;
  fees?: number | null; shippingCost?: number | null; ebayUrl?: string | null; notes?: string | null;
  brand?: string | null; modelNumber?: string | null; partNumber?: string | null;
  serialNumber?: string | null; tags?: string | null; lowStockThreshold?: number | null;
  categoryName?: string; locationName?: string;
};

type ProductResult = {
  found: boolean;
  product?: { name: string; description: string | null; brand: string | null; modelNumber: string | null; categoryName: string | null };
  source: string;
  sourceUrl: string;
};

type Props = { mode: "create" | "edit"; initial?: ItemFormValues; categoryNames: string[]; locationNames: string[]; photoCount?: number };

export default function ItemForm({ mode, initial = {}, categoryNames, locationNames, photoCount = 0 }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(initial.id);
  const [files, setFiles] = useState<File[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [product, setProduct] = useState<ProductResult | null>(null);
  const [lookupCode, setLookupCode] = useState("");
  const [applied, setApplied] = useState(false);

  function field(name: string) {
    const element = formRef.current?.elements.namedItem(name);
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element : null;
  }

  async function lookupProduct() {
    const code = field("upc")?.value.trim() ?? "";
    setLookupError("");
    setProduct(null);
    setApplied(false);
    setLookupCode(code);
    setLookupBusy(true);
    try {
      const result = await fetchJson<ProductResult>(`/api/products/lookup?code=${encodeURIComponent(code)}`);
      setProduct(result);
    } catch (error) {
      setLookupError(errorMessage(error));
    } finally {
      setLookupBusy(false);
    }
  }

  function applySuggestion() {
    if (field("upc")?.value.trim() !== lookupCode) {
      setLookupError("The barcode changed. Look it up again before applying a suggestion.");
      return;
    }
    if (!product?.product) return;
    let count = 0;
    for (const [name, value] of Object.entries(product.product)) {
      const input = field(name);
      if (input && !input.value.trim() && value) {
        input.value = value;
        count += 1;
      }
    }
    setApplied(true);
    setLookupError(count ? "" : "These fields already have values. Your entries were kept.");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    let persistedId = savedId;
    let itemSavedThisAttempt = false;
    try {
      const item = await fetchJson<{ id: string; sku: string }>(persistedId ? `/api/items/${persistedId}` : "/api/items",
        jsonRequest(persistedId ? "PATCH" : "POST", payload));
      persistedId = item.id;
      itemSavedThisAttempt = true;
      setSavedId(item.id);
      const skuInput = field("sku");
      if (skuInput && !skuInput.value.trim()) skuInput.value = item.sku;
      if (files.length) {
        const upload = new FormData();
        for (const file of files) upload.append("files", file);
        await fetchJson(`/api/items/${item.id}/photos`, { method: "POST", body: upload });
        setFiles([]);
      }
      router.push(`/items/${item.id}`);
      router.refresh();
    } catch (error) {
      setError(`${itemSavedThisAttempt && files.length ? "The item is saved, but the photos still need uploading. Retry Save to upload them without creating another item. " : ""}${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={saving}>
      {error && <div className="notice notice-error" role="alert"><p>{error}</p>{savedId && <Link href={`/items/${savedId}`} className="text-link">Open saved item</Link>}</div>}
      <div className="form-layout">
        <div>
          <section className="form-section">
            <h2>The basics</h2>
            <p>Give it a name you&apos;ll remember and a place you can find.</p>
            <div className="field-grid">
              <div className="full-width">
                <label className="field-label" htmlFor="name">Item name <span className="muted">(required)</span></label>
                <input id="name" name="name" required maxLength={200} defaultValue={initial.name ?? ""} className="input" placeholder="Raspberry Pi 4 Model B, 4 GB" />
              </div>
              <div className="full-width">
                <label className="field-label" htmlFor="description">Description</label>
                <textarea id="description" name="description" rows={3} maxLength={10000} defaultValue={initial.description ?? ""} className="input" placeholder="What is it, what is included, and what condition is it in?" />
              </div>
              <div>
                <label className="field-label" htmlFor="categoryName">Category</label>
                <input id="categoryName" name="categoryName" list="category-options" maxLength={100} defaultValue={initial.categoryName ?? ""} className="input" placeholder="Electronics" />
                <datalist id="category-options">{categoryNames.map((name) => <option key={name} value={name} />)}</datalist>
                <p className="field-hint">Choose an existing category or type a new one.</p>
              </div>
              <div>
                <label className="field-label" htmlFor="locationName">Storage location</label>
                <input id="locationName" name="locationName" list="location-options" maxLength={100} defaultValue={initial.locationName ?? ""} className="input" placeholder="Office / shelf A / bin 3" />
                <datalist id="location-options">{locationNames.map((name) => <option key={name} value={name} />)}</datalist>
              </div>
              <div>
                <label className="field-label" htmlFor="quantity">Quantity</label>
                <input id="quantity" name="quantity" type="number" min={0} max={1000000000} step={1} required defaultValue={initial.quantity ?? 1} className="input" />
              </div>
              <div>
                <label className="field-label" htmlFor="lowStockThreshold">Low-stock alert at</label>
                <input id="lowStockThreshold" name="lowStockThreshold" type="number" min={0} max={1000000000} step={1} defaultValue={initial.lowStockThreshold ?? ""} className="input" placeholder="Optional" />
                <p className="field-hint">Flag this item at or below this quantity. Leave blank to turn off.</p>
              </div>
              <div>
                <label className="field-label" htmlFor="condition">Condition</label>
                <select id="condition" name="condition" defaultValue={initial.condition ?? "USED"} className="input">{CONDITIONS.map((value) => <option key={value} value={value}>{CONDITION_LABELS[value]}</option>)}</select>
              </div>
              <div>
                <label className="field-label" htmlFor="status">Inventory status</label>
                <select id="status" name="status" defaultValue={initial.status ?? "IN_STOCK"} className="input">{STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select>
              </div>
            </div>
          </section>

          <section className="form-section">
            <h2>Codes &amp; component details</h2>
            <p>Keep manufacturer codes intact. Jeffventory creates its own printable SKU.</p>
            <div className="field-grid">
              <div className="full-width">
                <label className="field-label" htmlFor="upc">Product barcode or existing QR code</label>
                <input id="upc" name="upc" defaultValue={initial.upc ?? ""} maxLength={512} className="input mono" placeholder="UPC, EAN, or the text encoded in your existing label" aria-describedby="code-hint" />
                <p className="field-hint" id="code-hint">Leading zeros are preserved. Multiple items can share the same product code.</p>
              </div>
              <div className="full-width">
                <label className="field-label" htmlFor="sku">Internal SKU</label>
                <input id="sku" name="sku" defaultValue={initial.sku ?? ""} maxLength={100} className="input mono" placeholder="Auto-generated, e.g. JV-8F3KQ2" />
                <p className="field-hint">{mode === "edit" ? "Changing the SKU invalidates labels printed with the old code." : "Leave blank for a unique code, or reuse your own inventory label."}</p>
              </div>
              {([
                ["brand", "Brand / manufacturer", "Raspberry Pi"],
                ["modelNumber", "Model", "Model B"],
                ["partNumber", "Part number", "Manufacturer part number"],
                ["serialNumber", "Serial number", "Specific to this unit"],
              ] as const).map(([name, label, placeholder]) => <div key={name}>
                <label className="field-label" htmlFor={name}>{label}</label>
                <input id={name} name={name} defaultValue={initial[name] ?? ""} maxLength={200} className="input" placeholder={placeholder} />
              </div>)}
              <div className="full-width">
                <label className="field-label" htmlFor="tags">Tags</label>
                <input id="tags" name="tags" defaultValue={initial.tags ?? ""} maxLength={500} className="input" placeholder="smd, 0603, repair-kit" />
                <p className="field-hint">Comma-separated keywords for projects, specifications, and anything you search for.</p>
              </div>
            </div>
          </section>

          <section className="form-section">
            <h2>Value &amp; selling</h2>
            <p>All amounts are USD per unit. Status applies to the whole item record, not an individual sale.</p>
            <div className="field-grid">
              {([["purchasePrice", "Purchase price"], ["listPrice", "Asking price"]] as const).map(([name, label]) => <div key={name}>
                <label className="field-label" htmlFor={name}>{label} ($)</label>
                <input id={name} name={name} type="number" min={0} max={1000000000} step="0.01" defaultValue={initial[name] ?? ""} className="input" placeholder="Not recorded" />
              </div>)}
              <div className="full-width">
                <label className="field-label" htmlFor="ebayUrl">eBay listing URL</label>
                <input id="ebayUrl" name="ebayUrl" type="url" maxLength={2000} defaultValue={initial.ebayUrl ?? ""} className="input" placeholder="https://www.ebay.com/itm/..." />
              </div>
            </div>
            <details className="mt-5" open={initial.status === "SOLD" || undefined}>
              <summary className="muted mb-4">Sale price, fees &amp; shipping</summary>
              <div className="field-grid field-grid-three">
                {([["salePrice", "Sale price"], ["fees", "Marketplace fees"], ["shippingCost", "Shipping cost"]] as const).map(([name, label]) => <div key={name}>
                  <label className="field-label" htmlFor={name}>{label} ($)</label>
                  <input id={name} name={name} type="number" min={0} max={1000000000} step="0.01" defaultValue={initial[name] ?? ""} className="input" placeholder="Not recorded" />
                </div>)}
              </div>
            </details>
          </section>

          <section className="form-section">
            <h2>Photos</h2>
            <p>{photoCount ? `${photoCount} saved ${photoCount === 1 ? "photo" : "photos"}. Add more here; manage existing photos on the item page.` : "Capture the item, connectors, serial label, and any wear."} Photos are resized and saved locally, without location metadata.</p>
            <PhotoPicker files={files} onChange={setFiles} existingCount={photoCount} disabled={saving} />
          </section>

          <section className="form-section">
            <h2>Private notes</h2>
            <p>Test results, provenance, or reminders. These stay out of the listing draft.</p>
            <label className="sr-only" htmlFor="notes">Private notes</label>
            <textarea id="notes" name="notes" rows={3} maxLength={10000} defaultValue={initial.notes ?? ""} className="input" placeholder="Tested on the bench. Power adapter is in bin 3." />
          </section>
        </div>

        <aside className="form-aside">
          <h2>Start with a barcode</h2>
          <p>Already have the packaging? Enter its UPC or EAN to find a product name, brand, and model.</p>
          <button type="button" className="button" onClick={lookupProduct} disabled={lookupBusy || saving}>
            <Icon name="search" />{lookupBusy ? "Looking up product..." : "Look up product"}
          </button>
          <p>Optional: this sends only the barcode to UPCitemdb. Review the suggestion before using it. Your photos and inventory are not sent.</p>
          {lookupError && <p role="alert" className="notice notice-error">{lookupError}</p>}
          {product && !product.found && <p role="status" className="notice notice-warning">No product found for this barcode. You can still enter the details yourself.</p>}
          {product?.found && product.product && (
            <div className="product-suggestion">
              <h3>{product.product.name}</h3>
              <p>{[product.product.brand, product.product.modelNumber].filter(Boolean).join(" / ")}</p>
              {product.product.categoryName && <p>{product.product.categoryName}</p>}
              <p>Suggested by <a className="text-link" href={product.sourceUrl} target="_blank" rel="noreferrer">{product.source}</a>. Product catalogs can be incomplete or incorrect.</p>
              <button type="button" className="button button-small mt-3" onClick={applySuggestion} disabled={applied}>
                <Icon name={applied ? "check" : "plus"} />{applied ? "Suggestion applied" : "Fill empty fields"}
              </button>
              <p>Anything you have already entered is kept.</p>
            </div>
          )}
          <hr />
          <h3>From shelf to listing</h3>
          <p>After saving, print a label, adjust stock, or open the selling helper to draft an eBay description and estimate your net.</p>
          <p>A product barcode identifies a product. Your SKU identifies this inventory record.</p>
        </aside>
      </div>
      <div className="form-footer">
        <button type="submit" className="button button-primary" disabled={saving || lookupBusy}>
          <Icon name="check" />{saving ? (files.length ? "Saving item and photos..." : "Saving...") : savedId ? "Save changes" : "Create item"}
        </button>
        <Link href={initial.id ? `/items/${initial.id}` : "/"} className="button button-quiet">Cancel</Link>
        <span className="muted text-xs">Saved to your local inventory.</span>
      </div>
    </form>
  );
}
