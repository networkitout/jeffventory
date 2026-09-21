import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { parseBulkUpdate } from "@/lib/item-validation";
import { inventoryTransaction } from "@/lib/inventory-transactions";
import { statusActivity } from "@/lib/inventory-activity";

export async function POST(req: NextRequest) {
  try {
    const { ids, status, locationName } = parseBulkUpdate(await readJsonBody(req));
    const count = await inventoryTransaction(async (tx) => {
      const items = await tx.item.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, locationId: true },
      });
      if (items.length !== ids.length) {
        throw new ApiError(404, "One or more selected items no longer exist. Nothing was changed.");
      }
      const location =
        locationName
          ? await tx.location.upsert({
              where: { name: locationName }, create: { name: locationName }, update: {},
            })
          : null;
      const changed = await tx.item.updateMany({
        where: { id: { in: ids } },
        data: {
          ...(status !== undefined ? { status } : {}),
          ...(locationName !== undefined ? { locationId: location?.id ?? null } : {}),
        },
      });
      await tx.itemActivity.createMany({
        data: items.map((item) => {
          const changes: string[] = [];
          if (status !== undefined) {
            changes.push(statusActivity(item.status, status).message);
          }
          if (locationName !== undefined) {
            changes.push(locationName ? `Location set to ${locationName}.` : "Location cleared.");
          }
          return { itemId: item.id, type: "BULK_EDITED", message: `Bulk change: ${changes.join(" ")}` };
        }),
      });
      return changed.count;
    });
    return NextResponse.json({ count });
  } catch (error) {
    return apiErrorResponse(error, "POST /api/items/bulk");
  }
}
