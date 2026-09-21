import {
  CONDITIONS,
  STATUSES,
  isCondition,
  isStatus,
  type Condition,
  type Status,
} from "@/lib/constants";
import { ApiError } from "@/lib/api-errors";

export const MAX_QUANTITY = 1_000_000_000;
export const MAX_PRICE = 1_000_000_000;
export const MAX_BULK_ITEMS = 200;
export const MAX_CODE_LENGTH = 512;

const textLimits = {
  description: 20_000,
  upc: MAX_CODE_LENGTH,
  brand: 200,
  modelNumber: 200,
  partNumber: 200,
  serialNumber: 200,
  tags: 2000,
  ebayUrl: 2048,
  notes: 20_000,
  categoryName: 100,
  locationName: 100,
} as const;

export const priceFields = [
  "purchasePrice",
  "listPrice",
  "salePrice",
  "fees",
  "shippingCost",
] as const;

export type ItemPatch = Partial<
  Record<keyof typeof textLimits, string | null> &
    Record<(typeof priceFields)[number], number | null> & {
      name: string;
      sku: string | null;
      quantity: number;
      lowStockThreshold: number | null;
      status: Status;
      condition: Condition;
    }
>;

export type ItemCreate = ItemPatch & {
  name: string;
  quantity: number;
  status: Status;
  condition: Condition;
};

export function inputObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new ApiError(400, "Request contains an unsupported field.");
  }
  return record;
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new ApiError(400, `${field} must be text or null.`);
  const text = value.trim();
  if (text.length > maxLength) {
    throw new ApiError(400, `${field} must be at most ${maxLength} characters.`);
  }
  return text || null;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  const text = optionalText(value, field, maxLength);
  if (text === null) throw new ApiError(400, `${field} is required and cannot be blank.`);
  return text;
}

function integer(value: unknown, field: string, min = 0, max = MAX_QUANTITY): number {
  if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
    value = Number(value.trim());
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ApiError(400, `${field} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

export function parsePrice(value: unknown, field = "price"): number | null {
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) {
      throw new ApiError(400, `${field} must be a nonnegative USD amount with at most 2 decimal places.`);
    }
    value = Number(text);
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_PRICE) {
    throw new ApiError(400, `${field} must be a finite USD amount from 0 to ${MAX_PRICE}.`);
  }
  const cents = value * 100;
  const rounded = Math.round(cents);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(cents)) * 4;
  if (Math.abs(cents - rounded) > tolerance) {
    throw new ApiError(400, `${field} must have at most 2 decimal places.`);
  }
  return rounded / 100;
}

function validateEbayUrl(value: string | null) {
  if (value === null) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, "ebayUrl must be a valid http or https eBay URL.");
  }
  // Include common eBay country domains, without accepting lookalikes such as
  // ebay.com.attacker.example. Credentials are never meaningful in a listing URL.
  const ebayDomain =
    /(?:^|\.)ebay\.(?:com|ca|co\.uk|com\.au|de|fr|it|es|at|be|ch|ie|nl|pl|com\.sg|com\.hk|com\.my|ph)$/i;
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !ebayDomain.test(url.hostname) ||
    url.username ||
    url.password ||
    (url.port !== "" && url.port !== "80" && url.port !== "443")
  ) {
    throw new ApiError(400, "ebayUrl must be an http or https link on an eBay domain.");
  }
}

function parseItem(value: unknown, create: boolean): ItemPatch {
  const body = inputObject(value, [
    "name", "sku", "quantity", "lowStockThreshold", "status", "condition",
    ...Object.keys(textLimits), ...priceFields,
  ]);
  if (!create && Object.keys(body).length === 0) {
    throw new ApiError(400, "Supply at least one item field to update.");
  }
  const result: ItemPatch = {};
  if (create || "name" in body) result.name = requiredText(body.name, "name", 200);
  if ("sku" in body) {
    result.sku = create
      ? optionalText(body.sku, "sku", 200)
      : requiredText(body.sku, "sku", 200);
  }
  if ("quantity" in body) result.quantity = integer(body.quantity, "quantity");
  if ("lowStockThreshold" in body) {
    result.lowStockThreshold =
      body.lowStockThreshold === null ||
      (typeof body.lowStockThreshold === "string" && body.lowStockThreshold.trim() === "")
        ? null
        : integer(body.lowStockThreshold, "lowStockThreshold");
  }
  if ("status" in body) {
    if (typeof body.status !== "string" || !isStatus(body.status)) {
      throw new ApiError(400, `status must be one of: ${STATUSES.join(", ")}.`);
    }
    result.status = body.status;
  }
  if ("condition" in body) {
    if (typeof body.condition !== "string" || !isCondition(body.condition)) {
      throw new ApiError(400, `condition must be one of: ${CONDITIONS.join(", ")}.`);
    }
    result.condition = body.condition;
  }
  for (const field of Object.keys(textLimits) as (keyof typeof textLimits)[]) {
    if (field in body) result[field] = optionalText(body[field], field, textLimits[field]);
  }
  for (const field of priceFields) {
    if (field in body) result[field] = parsePrice(body[field], field);
  }
  if (result.ebayUrl !== undefined) validateEbayUrl(result.ebayUrl);
  return result;
}

export function parseItemCreate(value: unknown): ItemCreate {
  const item = parseItem(value, true);
  return {
    ...item,
    name: item.name!,
    quantity: item.quantity ?? 1,
    status: item.status ?? "IN_STOCK",
    condition: item.condition ?? "USED",
  };
}

export function parseItemPatch(value: unknown): ItemPatch {
  return parseItem(value, false);
}

export function parseNamedEntity(value: unknown): string {
  const body = inputObject(value, ["name"]);
  return requiredText(body.name, "name", 100);
}

export function parseIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BULK_ITEMS) {
    throw new ApiError(400, `ids must contain between 1 and ${MAX_BULK_ITEMS} item IDs.`);
  }
  const ids = value.map((id) => requiredText(id, "Each item ID", 200));
  return [...new Set(ids)];
}

export function parseBulkUpdate(value: unknown): {
  ids: string[];
  status?: Status;
  locationName?: string | null;
} {
  const body = inputObject(value, ["ids", "status", "locationName"]);
  if (!("status" in body) && !("locationName" in body)) {
    throw new ApiError(400, "Supply a status or locationName for the bulk change.");
  }
  const result: ReturnType<typeof parseBulkUpdate> = { ids: parseIds(body.ids) };
  if ("status" in body) {
    if (typeof body.status !== "string" || !isStatus(body.status)) {
      throw new ApiError(400, `status must be one of: ${STATUSES.join(", ")}.`);
    }
    result.status = body.status;
  }
  if ("locationName" in body) {
    result.locationName = optionalText(body.locationName, "locationName", 100);
  }
  return result;
}

export function parseQuantityChange(value: unknown): { delta: number; note: string | null } {
  const body = inputObject(value, ["delta", "note"]);
  const delta = integer(body.delta, "delta", -MAX_QUANTITY, MAX_QUANTITY);
  if (delta === 0) throw new ApiError(400, "delta must not be zero.");
  const note = "note" in body ? optionalText(body.note, "note", 1000) : null;
  return { delta, note };
}
