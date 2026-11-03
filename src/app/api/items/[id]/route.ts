import { withInventoryAuth } from "@/lib/auth-route";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { ApiError, apiErrorResponse, assertMutationRequest, readJsonBody } from "@/lib/api-errors";
import { parseItemPatch } from "@/lib/item-validation";
import { itemRelations } from "@/lib/inventory-query";
import { editActivities } from "@/lib/inventory-activity";
import { inventoryTransaction } from "@/lib/inventory-transactions";
import { removePhotoFiles } from "@/lib/photos";

type Params = { params: Promise<{ id: string }> };

export const GET = withInventoryAuth(async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        ...itemRelations,
        activities: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30 },
      },
    });
    if (!item) throw new ApiError(404, "Item not found.");
    return NextResponse.json(item);
  } catch (error) {
    return apiErrorResponse(error, "GET /api/items/[id]");
  }
});

export const PATCH = withInventoryAuth(async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const patch = parseItemPatch(await readJsonBody(req));
    const { categoryName, locationName, sku, ...fields } = patch;
    const data: Prisma.ItemUpdateInput = {
      ...fields,
      ...(sku !== undefined ? { sku: sku! } : {}),
    };
    if (categoryName !== undefined) {
      data.category = categoryName
        ? { connectOrCreate: { where: { name: categoryName }, create: { name: categoryName } } }
        : { disconnect: true };
    }
    if (locationName !== undefined) {
      data.location = locationName
        ? { connectOrCreate: { where: { name: locationName }, create: { name: locationName } } }
        : { disconnect: true };
    }
    const item = await inventoryTransaction(async (tx) => {
      const before = await tx.item.findUnique({ where: { id }, include: itemRelations });
      if (!before) throw new ApiError(404, "Item not found.");
      const updated = await tx.item.update({ where: { id }, data, include: itemRelations });
      const activities = editActivities(before, patch);
      if (activities.length) {
        await tx.itemActivity.createMany({
          data: activities.map((activity) => ({ ...activity, itemId: id })),
        });
      }
      return updated;
    });
    return NextResponse.json(item);
  } catch (error) {
    return apiErrorResponse(error, "PATCH /api/items/[id]", "SKU already exists.");
  }
});

export const DELETE = withInventoryAuth(async function DELETE(req: NextRequest, { params }: Params) {
  try {
    assertMutationRequest(req);
    const { id } = await params;
    const filenames = await inventoryTransaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id }, include: { photos: true } });
      if (!item) throw new ApiError(404, "Item not found.");
      await tx.item.delete({ where: { id } });
      return item.photos.map((photo) => photo.filename);
    });
    // Delete only after the transaction commits: a database failure must never
    // remove a file still referenced by an item. Cleanup failures are surfaced.
    await removePhotoFiles(filenames, "Item was deleted, but photo cleanup failed. Check server logs.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "DELETE /api/items/[id]");
  }
});
