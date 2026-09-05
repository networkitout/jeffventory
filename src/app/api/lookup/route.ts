import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Resolve a scanned code to inventory.
 * Order: exact SKU match (our printed QR labels) -> UPC match (product barcodes).
 * UPC can match multiple items, so it returns a list.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  const bySku = await prisma.item.findUnique({
    where: { sku: code },
    include: { category: true, location: true },
  });
  if (bySku) return NextResponse.json({ match: "sku", item: bySku });

  const byUpc = await prisma.item.findMany({
    where: { upc: code },
    include: { category: true, location: true },
    orderBy: { updatedAt: "desc" },
  });
  if (byUpc.length > 0) return NextResponse.json({ match: "upc", items: byUpc });

  return NextResponse.json({ match: null });
}
