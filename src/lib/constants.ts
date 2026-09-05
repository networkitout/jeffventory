export const STATUSES = ["IN_STOCK", "LISTED", "SOLD", "ARCHIVED"] as const;
export type Status = (typeof STATUSES)[number];

export const CONDITIONS = ["NEW", "LIKE_NEW", "USED", "FOR_PARTS"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const STATUS_LABELS: Record<Status, string> = {
  IN_STOCK: "In stock",
  LISTED: "Listed",
  SOLD: "Sold",
  ARCHIVED: "Archived",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  NEW: "New",
  LIKE_NEW: "Like new",
  USED: "Used",
  FOR_PARTS: "For parts",
};

export function formatMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}
