"use client";

import { useEffect } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Jeffventory page error", error); }, [error]);
  return (
    <div className="empty-state">
      <Icon name="alert" width="40" height="40" />
      <h1>We couldn&apos;t load this page</h1>
      <p>Your inventory hasn&apos;t been changed. Try again, or check that the local database is set up with <code>npm run db:setup</code>.</p>
      <div className="actions">
        <button type="button" className="button button-primary" onClick={reset}>Try again</button>
        <Link href="/" className="button">Back to inventory</Link>
      </div>
    </div>
  );
}
