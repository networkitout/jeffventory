import type { Item } from "@/generated/prisma/client";
import { STATUS_LABELS, type Status } from "@/lib/constants";
import type { ItemPatch } from "@/lib/item-validation";

type Activity = { type: string; message: string };
type ItemBefore = Item & {
  category: { name: string } | null;
  location: { name: string } | null;
};

const fieldLabels: Partial<Record<keyof ItemPatch, string>> = {
  sku: "SKU",
  upc: "external code",
  name: "name",
  description: "description",
  condition: "condition",
  purchasePrice: "purchase price",
  listPrice: "list price",
  salePrice: "sale price",
  fees: "fees",
  shippingCost: "shipping cost",
  lowStockThreshold: "low-stock threshold",
  ebayUrl: "eBay link",
  notes: "notes",
  brand: "brand",
  modelNumber: "model number",
  partNumber: "part number",
  serialNumber: "serial number",
  tags: "tags",
  categoryName: "category",
  locationName: "location",
};

export function statusActivity(before: string, after: Status): Activity {
  return {
    type: "STATUS_CHANGED",
    message: `Status changed from ${STATUS_LABELS[before as Status] ?? before} to ${STATUS_LABELS[after]}.`,
  };
}

export function quantityActivity(before: number, after: number, note?: string | null): Activity {
  const delta = after - before;
  return {
    type: "QUANTITY_CHANGED",
    message: `Quantity ${delta >= 0 ? "increased" : "decreased"} by ${Math.abs(delta)} (${before} -> ${after}).${note ? ` ${note}` : ""}`,
  };
}

export function editActivities(before: ItemBefore, patch: ItemPatch): Activity[] {
  const activities: Activity[] = [];
  if (patch.status !== undefined && patch.status !== before.status) {
    activities.push(statusActivity(before.status, patch.status));
  }
  if (patch.quantity !== undefined && patch.quantity !== before.quantity) {
    activities.push(quantityActivity(before.quantity, patch.quantity));
  }
  const changed = (Object.keys(patch) as (keyof ItemPatch)[]).filter((field) => {
    if (field === "status" || field === "quantity") return false;
    if (field === "categoryName") return (before.category?.name ?? null) !== patch[field];
    if (field === "locationName") return (before.location?.name ?? null) !== patch[field];
    return before[field] !== patch[field];
  });
  if (changed.length) {
    activities.push({
      type: "EDITED",
      message: `Updated ${changed.map((field) => fieldLabels[field] ?? field).join(", ")}.`,
    });
  }
  return activities;
}
