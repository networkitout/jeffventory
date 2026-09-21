import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, apiErrorResponse } from "@/lib/api-errors";
import { barcodeCandidates } from "@/lib/codes";
import { MAX_CODE_LENGTH } from "@/lib/item-validation";
import { itemRelations } from "@/lib/inventory-query";

/**
 * Resolve a scanned code to inventory.
 * Order: exact SKU match (our printed QR labels) -> UPC match (product barcodes).
 * UPC can match multiple items, so it returns a list.
 */
export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code")?.trim();
    if (!code) throw new ApiError(400, "code is required.");
    if (code.length > MAX_CODE_LENGTH) throw new ApiError(400, "code is too long.");

    const bySku = await prisma.item.findUnique({
      where: { sku: code },
      include: itemRelations,
    });
    if (bySku) return NextResponse.json({ match: "sku", item: bySku });

    const candidates = barcodeCandidates(code);
    const byUpc = await prisma.item.findMany({
      where: { upc: { in: candidates } },
      include: itemRelations,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    if (byUpc.length > 0) return NextResponse.json({ match: "upc", items: byUpc });

    return NextResponse.json({ match: null });
  } catch (error) {
    return apiErrorResponse(error, "GET /api/lookup");
  }
}
