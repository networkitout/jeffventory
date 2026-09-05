"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import Scanner from "@/components/Scanner";

type LookupResult =
  | { match: "sku"; item: { id: string; name: string } }
  | { match: "upc"; items: Array<{ id: string; name: string }> }
  | { match: null };

export default function ScanPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"scanning" | "looking" | "notfound">("scanning");
  const [code, setCode] = useState<string | null>(null);
  const busyRef = useRef(false);

  const handleDecode = useCallback(
    async (text: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setCode(text);
      setStatus("looking");

      try {
        const res = await fetch(`/api/lookup?code=${encodeURIComponent(text)}`);
        const data: LookupResult = await res.json();

        if (data.match === "sku") {
          router.push(`/items/${data.item.id}`);
          return;
        }
        if (data.match === "upc") {
          if (data.items.length === 1) {
            router.push(`/items/${data.items[0].id}`);
          } else {
            router.push(`/?q=${encodeURIComponent(text)}`);
          }
          return;
        }
        setStatus("notfound");
      } catch {
        setStatus("notfound");
      } finally {
        // Allow re-scan only when we stayed on this page.
        setTimeout(() => {
          busyRef.current = false;
        }, 1500);
      }
    },
    [router]
  );

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Scan a code</h1>
      <p className="text-sm text-zinc-400">
        Point the camera at a UPC/EAN product barcode or a Jeffventory QR label. Known codes jump straight to the
        item.
      </p>

      <Scanner onDecode={handleDecode} paused={status !== "scanning"} />

      {status === "looking" && (
        <p className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm">
          Looking up <span className="font-mono">{code}</span>…
        </p>
      )}

      {status === "notfound" && code && (
        <div className="space-y-3 rounded-md border border-amber-800 bg-amber-950/50 px-4 py-3 text-sm">
          <p>
            No item matches <span className="font-mono font-semibold">{code}</span>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/items/new?upc=${encodeURIComponent(code)}`}
              className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500"
            >
              + Add item with this UPC
            </Link>
            <button
              onClick={() => {
                setCode(null);
                setStatus("scanning");
              }}
              className="rounded-md border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
            >
              Scan again
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Tip: camera scanning requires HTTPS (or localhost). On a phone, open this app over HTTPS to scan shelf
        labels on the go.
      </p>
    </div>
  );
}
