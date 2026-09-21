import type { Prisma } from "@/generated/prisma/client";
import type { itemRelations } from "@/lib/inventory-query";

type ExportItem = Prisma.ItemGetPayload<{ include: typeof itemRelations }> & {
  activities?: { id: string; type: string; message: string; createdAt: Date }[];
};

// Every field is quoted, including numbers. This preserves embedded separators,
// quotes and newlines; none can start a second spreadsheet cell. Prefix dangerous
// cells even when a formula is hidden behind whitespace/control/format characters.
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  const formula = /^[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]*[=+\-@\uff1d\uff0b\uff0d\uff20]/u;
  if (formula.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

const scalarColumns = [
  "id", "sku", "name", "description", "quantity", "upc", "brand",
  "modelNumber", "partNumber", "serialNumber", "tags", "condition", "status",
  "lowStockThreshold", "purchasePrice", "listPrice", "salePrice", "fees",
  "shippingCost", "ebayUrl", "notes", "categoryId", "locationId",
] as const;

export function inventoryCsv(items: ExportItem[]): string {
  const headers = [
    ...scalarColumns, "category", "location", "createdAt", "updatedAt",
    "currency", "priceBasis", "photos", "activities",
  ];
  const rows = items.map((item) => [
    ...scalarColumns.map((column) => item[column]),
    item.category?.name ?? null,
    item.location?.name ?? null,
    item.createdAt.toISOString(),
    item.updatedAt.toISOString(),
    "USD",
    "per-unit",
    JSON.stringify(item.photos),
    JSON.stringify(item.activities ?? []),
  ]);
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function inventoryMetadata(items: ExportItem[], exportedAt = new Date()) {
  return {
    version: 1,
    kind: "jeffventory-inventory-metadata",
    exportedAt: exportedAt.toISOString(),
    currency: "USD",
    priceBasis: "per-unit",
    includesImageBinaries: false,
    items,
  };
}
