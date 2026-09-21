"use client";

import { useState } from "react";
import { calculateNet, listingDescription, listingTitle, type SellingItem } from "@/lib/selling";
import { formatMoney } from "@/lib/constants";
import Icon from "./Icon";

type Props = {
  item: SellingItem & {
    purchasePrice: number | null; listPrice: number | null; salePrice: number | null;
    fees: number | null; shippingCost: number | null;
  };
};

export default function SellingHelper({ item }: Props) {
  const title = listingTitle(item);
  const description = listingDescription(item);
  const [price, setPrice] = useState(String(item.salePrice ?? item.listPrice ?? ""));
  const [cost, setCost] = useState(String(item.purchasePrice ?? ""));
  const [fees, setFees] = useState(String(item.fees ?? 0));
  const [shipping, setShipping] = useState(String(item.shippingCost ?? 0));
  const [copyMessage, setCopyMessage] = useState("");
  const [copyError, setCopyError] = useState("");
  const values = [price, cost, fees, shipping];
  const valid = values.every((value) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1000000000);
  const net = valid ? calculateNet(Number(price), Number(cost), Number(fees), Number(shipping)) : null;
  const soldSearch = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(title)}&LH_Sold=1&LH_Complete=1`;

  async function copy(text: string, label: string) {
    setCopyMessage("");
    setCopyError("");
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopyMessage(`${label} copied.`);
    } catch {
      setCopyError("Clipboard access is unavailable. Select the text below and copy it manually.");
    }
  }

  return (
    <div>
      <p className="muted text-sm mb-4">Prepare a listing from the details you already have. Review the draft before posting.</p>
      <div className="actions">
        <a href={soldSearch} target="_blank" rel="noreferrer" className="button button-small"><Icon name="search" />Research sold prices</a>
        <a href="https://www.ebay.com/sl/sell" target="_blank" rel="noreferrer" className="button button-small"><Icon name="external" />Create eBay listing</a>
      </div>
      {copyError && <p className="notice notice-error mt-4" role="alert">{copyError}</p>}
      {copyMessage && <p className="mt-3 text-sm text-emerald-200" role="status">{copyMessage}</p>}
      <div className="draft-field">
        <header><label htmlFor="listing-title" className="field-label mb-0!">Listing title <span className="muted">({[...title].length}/80)</span></label>
          <button className="button button-small button-quiet" onClick={() => copy(title, "Title")}><Icon name="copy" />Copy title</button></header>
        <input id="listing-title" className="input" readOnly value={title} onFocus={(event) => event.target.select()} />
      </div>
      <div className="draft-field">
        <header><label htmlFor="listing-description" className="field-label mb-0!">Listing description</label>
          <button className="button button-small button-quiet" onClick={() => copy(description, "Description")}><Icon name="copy" />Copy description</button></header>
        <textarea id="listing-description" className="input" readOnly value={description} onFocus={(event) => event.target.select()} />
        <p className="field-hint">Private notes, storage locations, and serial numbers are not included in this draft.</p>
      </div>
      <h3 className="mt-6 mb-3">What would you take home?</h3>
      <div className="selling-fields">
        {[
          { id: "estimate-price", label: "Sale / asking price", value: price, set: setPrice },
          { id: "estimate-cost", label: "Purchase cost", value: cost, set: setCost },
          { id: "estimate-fees", label: "Marketplace fees", value: fees, set: setFees },
          { id: "estimate-shipping", label: "Shipping cost", value: shipping, set: setShipping },
        ].map((field) => <div key={field.id}>
          <label className="field-label" htmlFor={field.id}>{field.label} ($)</label>
          <input id={field.id} className="input" type="number" step="0.01" min={0} max={1000000000} placeholder="Not recorded"
            value={field.value} onChange={(event) => field.set(event.target.value)} />
        </div>)}
      </div>
      <div className="net-line"><span>Estimated net per unit</span><strong aria-live="polite">{net === null ? "Add costs above" : formatMoney(net)}</strong></div>
      <p className="field-hint">Price minus purchase cost, fees, and shipping. Zero means no cost. Fees vary by category and account; this is a what-if estimate, not an eBay fee quote. Save actual amounts in Edit item.</p>
    </div>
  );
}
