import { NextRequest } from "next/server";
import bwipjs from "bwip-js/node";
import { pickBarcodeType } from "@/lib/sku";

const ALLOWED = new Set(["qrcode", "upca", "ean13", "ean8", "code128", "datamatrix"]);

/**
 * Render a barcode/QR PNG server-side.
 * GET /api/barcode?text=JV-ABC123&type=qrcode&scale=3
 * `type=auto` (default) picks a retail symbology for numeric codes, else code128.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const text = sp.get("text")?.trim();
  if (!text) return new Response("text is required", { status: 400 });

  let type = sp.get("type") ?? "auto";
  if (type === "auto") type = pickBarcodeType(text);
  if (!ALLOWED.has(type)) return new Response("unsupported type", { status: 400 });

  const scale = Math.min(Math.max(Number(sp.get("scale") ?? 3), 1), 8);
  const is2d = type === "qrcode" || type === "datamatrix";

  try {
    const png = await bwipjs.toBuffer({
      bcid: type,
      text,
      scale,
      ...(is2d ? {} : { height: 12, includetext: true, textxalign: "center" }),
    });
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return new Response(`barcode error: ${e instanceof Error ? e.message : "invalid input"}`, { status: 400 });
  }
}
