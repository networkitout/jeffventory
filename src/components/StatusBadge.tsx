import { STATUS_LABELS, type Status } from "@/lib/constants";

const STYLES: Record<Status, string> = {
  IN_STOCK: "bg-emerald-950 text-emerald-400 border-emerald-800",
  LISTED: "bg-sky-950 text-sky-400 border-sky-800",
  SOLD: "bg-amber-950 text-amber-400 border-amber-800",
  ARCHIVED: "bg-zinc-900 text-zinc-500 border-zinc-700",
};

export default function StatusBadge({ status }: { status: Status }) {
  const style = STYLES[status] ?? STYLES.ARCHIVED;
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${style}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
