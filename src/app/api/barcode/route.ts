import { NextRequest } from "next/server";
import bwipjs from "bwip-js/node";
import { pickBarcodeType } from "@/lib/sku";

const ALLOWED = new Set(["qrcode", "upca", "ean13", "ean8", "code128", "datamatrix"]);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const text = sp.get("text")?.trim();
  if (!text) return new Response("text is required", { status: 400 });
  if (text.length > 512) return new Response("text must be 512 characters or fewer", { status: 400 });

  let type = sp.get("type") ?? "auto";
  if (type === "auto") type = pickBarcodeType(text);
  if (!ALLOWED.has(type)) return new Response("unsupported type", { status: 400 });

  const scale = Number(sp.get("scale") ?? 3);
  if (!Number.isInteger(scale) || scale < 1 || scale > 8) {
    return new Response("scale must be a whole number from 1 to 8", { status: 400 });
  }
  const is2d = type === "qrcode" || type === "datamatrix";

  try {
    const png = await bwipjs.toBuffer({
      bcid: type,
      text,
      scale,
      backgroundcolor: "FFFFFF",
      paddingwidth: is2d ? 4 : 10,
      paddingheight: 4,
      ...(is2d ? {} : { height: 12, includetext: true, textxalign: "center" }),
    });
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return new Response(`barcode error: ${e instanceof Error ? e.message : "invalid input"}`, { status: 400 });
  }
}
