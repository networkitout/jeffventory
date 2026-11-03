import { withInventoryAuth } from "@/lib/auth-route";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, apiErrorResponse } from "@/lib/api-errors";
import { buildItemOrderBy, buildItemWhere, itemRelations } from "@/lib/inventory-query";
import { parseIds } from "@/lib/item-validation";
import { inventoryCsv, inventoryMetadata } from "@/lib/inventory-export";

export const GET = withInventoryAuth(async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams;
    const format = search.get("format") ?? "csv";
    if (format !== "csv" && format !== "json") {
      throw new ApiError(400, "format must be csv or json.");
    }
    // An explicit selection is authoritative, even if stale search filters remain
    // in the URL. It must never silently turn into a whole-inventory export.
    const ids = search.has("ids") ? parseIds(search.get("ids")!.split(",")) : null;
    const filters = ids ? new URLSearchParams({ ids: ids.join(",") }) : search;
    const items = await prisma.item.findMany({
      where: buildItemWhere(filters),
      include: {
        ...itemRelations,
        activities: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
      orderBy: [buildItemOrderBy(search), { id: "asc" }],
    });
    if (ids && items.length !== ids.length) {
      throw new ApiError(404, "One or more selected items no longer exist. Refresh your selection.");
    }
    const now = new Date();
    const body = format === "csv"
      ? inventoryCsv(items)
      : JSON.stringify(inventoryMetadata(items, now), null, 2);
    return new Response(body, {
      headers: {
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="jeffventory-${now.toISOString().slice(0, 10)}.${format}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "GET /api/export");
  }
});
