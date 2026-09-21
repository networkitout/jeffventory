import { CONDITION_LABELS, isCondition } from "./constants";

export type SellingItem = {
  name: string;
  description: string | null;
  brand: string | null;
  modelNumber: string | null;
  partNumber: string | null;
  condition: string;
  quantity: number;
};

export function listingTitle(item: SellingItem): string {
  const parts = [item.name];
  for (const detail of [item.brand, item.modelNumber]) {
    if (detail && !parts.join(" ").toLowerCase().includes(detail.toLowerCase())) parts.push(detail);
  }
  return [...parts.join(" ").trim()].slice(0, 80).join("");
}

export function listingDescription(item: SellingItem): string {
  return [
    item.name,
    item.description,
    "",
    `Condition: ${isCondition(item.condition) ? CONDITION_LABELS[item.condition] : item.condition}`,
    item.brand ? `Brand: ${item.brand}` : null,
    item.modelNumber ? `Model: ${item.modelNumber}` : null,
    item.partNumber ? `Part number: ${item.partNumber}` : null,
    `Available quantity: ${item.quantity}`,
  ].filter((line) => line !== null).join("\n");
}

export function calculateNet(
  price: number,
  cost: number,
  fees: number,
  shipping: number,
): number {
  return (
    Math.round(price * 100) -
    Math.round(cost * 100) -
    Math.round(fees * 100) -
    Math.round(shipping * 100)
  ) / 100;
}
