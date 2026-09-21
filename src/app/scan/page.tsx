"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, fetchJson } from "@/lib/client-api";
import Icon from "@/components/Icon";

const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false, loading: () => <p role="status" className="muted">Preparing camera...</p> });
type Match = { id: string; name: string; sku: string; location?: { name: string } | null };
type LookupResult = { match: "sku"; item: Match } | { match: "upc"; items: Match[] } | { match: null };

export default function ScanPage() {
  const router = useRouter();
  const [cameraOn, setCameraOn] = useState(false);
  const [status, setStatus] = useState<"idle" | "looking" | "missing" | "matches" | "error">("idle");
  const [code, setCode] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const busyRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; requestRef.current?.abort(); };
  }, []);

  const handleDecode = useCallback(async (raw: string) => {
    if (busyRef.current || !mountedRef.current) return;
    const text = raw.trim();
    if (!text || text.length > 512) {
      setError("Enter a code between 1 and 512 characters.");
      setStatus("error");
      return;
    }
    busyRef.current = true;
    setCode(text);
    setCameraOn(false);
    setStatus("looking");
    setError("");
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    try {
      const result = await fetchJson<LookupResult>(`/api/lookup?code=${encodeURIComponent(text)}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.match === "sku") {
        router.push(`/items/${result.item.id}`);
      } else if (result.match === "upc" && result.items.length === 1) {
        router.push(`/items/${result.items[0].id}`);
      } else if (result.match === "upc") {
        setMatches(result.items);
        setStatus("matches");
      } else {
        setStatus("missing");
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setError(errorMessage(error));
      setStatus("error");
    } finally {
      if (requestRef.current === controller) busyRef.current = false;
    }
  }, [router]);

  async function scanImage(file?: File) {
    if (!file) return;
    setError("");
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose an image smaller than 10 MB.");
      setStatus("error");
      return;
    }
    setCameraOn(false);
    setImageBusy(true);
    const url = URL.createObjectURL(file);
    let decoded: string | undefined;
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      decoded = result.getText();
    } catch {
      setError("No readable barcode or QR code was found in that image. Try a sharper, closer photo with the whole code visible.");
      setStatus("error");
    } finally {
      URL.revokeObjectURL(url);
      setImageBusy(false);
    }
    if (decoded && mountedRef.current) await handleDecode(decoded);
  }

  function reset() {
    requestRef.current?.abort();
    busyRef.current = false;
    setStatus("idle");
    setCode("");
    setMatches([]);
    setError("");
    inputRef.current?.focus();
  }

  return (
    <div>
      <header className="page-header"><div><h1>One scan. The right item.</h1><p>Use your camera, a barcode photo, or a USB scanner. Existing labels work here too.</p></div></header>
      <div className="scan-layout">
        <section className="scanner-frame" aria-label="Barcode camera">
          {cameraOn ? <><Scanner onDecode={handleDecode} paused={status === "looking"} />
            <button type="button" className="button mt-3" onClick={() => setCameraOn(false)}>Stop camera</button></> :
            <div className="scanner-idle">
              <Icon name="scan" width="64" height="64" />
              <h2>Find what&apos;s behind the label</h2>
              <p>Point at a product barcode or one of your Jeffventory labels.</p>
              <button type="button" className="button button-primary" onClick={() => { reset(); setCameraOn(true); }} disabled={status === "looking" || imageBusy}>
                <Icon name="camera" />Start camera
              </button>
              <span className="muted text-xs">The camera starts only when you choose.</span>
            </div>}
          <div className="scanner-controls">
            <input type="file" className="hidden" aria-label="Choose a barcode photo" ref={fileRef} accept="image/jpeg,image/png,image/webp"
              onChange={(event) => { void scanImage(event.target.files?.[0]); event.target.value = ""; }} />
            <button type="button" className="button button-small" disabled={imageBusy || status === "looking"} onClick={() => fileRef.current?.click()}>
              <Icon name="upload" />{imageBusy ? "Reading image..." : "Scan a photo"}
            </button>
            <span className="muted text-xs">UPCs, EANs, QR codes &amp; Code 128</span>
          </div>
        </section>
        <div>
          <h2 className="mb-3">Have the code already?</h2>
          <form onSubmit={(event) => { event.preventDefault(); void handleDecode(code); }} className="field-stack" aria-label="Look up an inventory code">
            <div>
              <label className="field-label" htmlFor="manual-code">Enter or scan a code</label>
              <input ref={inputRef} id="manual-code" className="input mono" value={code} onChange={(event) => setCode(event.target.value)}
                autoComplete="off" spellCheck={false} maxLength={512} placeholder="JV-8F3KQ2 or a product barcode" required disabled={status === "looking" || imageBusy} />
              <p className="field-hint">USB scanners work like a keyboard. Focus here and scan, then press Enter.</p>
            </div>
            <button type="submit" className="button" disabled={status === "looking" || imageBusy}><Icon name="search" />Find in inventory</button>
          </form>
          {status === "looking" && <p className="notice mt-5" role="status">Looking for <span className="mono">{code}</span>...</p>}
          {status === "error" && <div className="notice notice-error mt-5" role="alert"><p>{error}</p><button className="button button-small mt-3" onClick={reset}>Try another code</button></div>}
          {status === "missing" && <div className="notice notice-warning mt-5" role="status">
            <h3>Not in your inventory yet</h3><p className="mono">{code}</p><p>Keep this code and add the item&apos;s details. Product information lookup is available in the form.</p>
            <Link href={`/items/new?upc=${encodeURIComponent(code)}`} className="button button-primary mt-4"><Icon name="plus" />Add item with this code</Link>
            <button className="button button-quiet mt-2" onClick={reset}>Scan another</button>
          </div>}
          {status === "matches" && <div className="mt-5">
            <h3 className="mb-2">{matches.length} items share this product code</h3>
            <div className="scan-matches">{matches.map((item) => <Link key={item.id} href={`/items/${item.id}`}>
              <span>{item.name}<span className="item-subtitle">{item.sku} {item.location?.name ? `/ ${item.location.name}` : ""}</span></span><Icon name="arrow" />
            </Link>)}</div><button className="button button-quiet mt-3" onClick={reset}>Scan another</button>
          </div>}
          <section className="scan-help">
            <h2>Made for the workbench</h2>
            <p>An inventory SKU opens one item. A product barcode can point to several items with different locations or conditions.</p>
            <p>Camera frames and barcode photos are decoded on your device, not uploaded to a scanning service.</p>
            <p>Phone cameras need a trusted HTTPS connection. The app runs on localhost by default; don&apos;t expose an unauthenticated inventory to the public internet.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
