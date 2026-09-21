import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { MAX_QUANTITY, parseQuantityChange } from "@/lib/item-validation";
import { itemRelations } from "@/lib/inventory-query";
import { inventoryTransaction } from "@/lib/inventory-transactions";
import { quantityActivity } from "@/lib/inventory-activity";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { delta, note } = parseQuantityChange(await readJsonBody(req));
    const item = await inventoryTransaction(async (tx) => {
      // The range predicate and increment are one SQL UPDATE, not read/modify/write.
      const result = await tx.item.updateMany({
        where: {
          id,
          quantity: {
            gte: Math.max(0, -delta),
            lte: Math.min(MAX_QUANTITY, MAX_QUANTITY - delta),
          },
        },
        data: { quantity: { increment: delta } },
      });
      if (result.count === 0) {
        if (!(await tx.item.findUnique({ where: { id }, select: { id: true } }))) {
          throw new ApiError(404, "Item not found.");
        }
        throw new ApiError(
          409,
          delta < 0 ? "Quantity cannot fall below zero." : `Quantity cannot exceed ${MAX_QUANTITY}.`,
        );
      }
      const updated = await tx.item.findUniqueOrThrow({ where: { id }, include: itemRelations });
      await tx.itemActivity.create({
        data: { itemId: id, ...quantityActivity(updated.quantity - delta, updated.quantity, note) },
      });
      return updated;
    });
    return NextResponse.json(item);
  } catch (error) {
    return apiErrorResponse(error, "POST /api/items/[id]/quantity");
  }
}
