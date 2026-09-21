import Link from "next/link";
import Icon from "@/components/Icon";

export default function NotFound() {
  return (
    <div className="empty-state">
      <Icon name="search" width="40" height="40" />
      <h1>Not on this shelf</h1>
      <p>This page or item could not be found. It may have been deleted, or the link may be out of date.</p>
      <Link href="/" className="button button-primary">Back to inventory</Link>
    </div>
  );
}
