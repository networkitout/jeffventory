import { STATUS_LABELS, isStatus } from "@/lib/constants";

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${isStatus(status) ? status.toLowerCase() : "archived"}`}>
      <span aria-hidden="true" />
      {isStatus(status) ? STATUS_LABELS[status] : status}
    </span>
  );
}
