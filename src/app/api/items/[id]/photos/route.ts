import { withInventoryAuth } from "@/lib/auth-route";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, apiErrorResponse, assertMutationRequest } from "@/lib/api-errors";
import { inventoryTransaction } from "@/lib/inventory-transactions";
import {
  MAX_PHOTOS_PER_ITEM,
  processPhoto,
  readPhotoUploads,
  removePhotoFiles,
  storePhotoFiles,
  type ProcessedPhoto,
} from "@/lib/photos";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export const GET = withInventoryAuth(async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const item = await prisma.item.findUnique({
      where: { id },
      select: { photos: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    if (!item) throw new ApiError(404, "Item not found.");
    return NextResponse.json(item.photos);
  } catch (error) {
    return apiErrorResponse(error, "GET /api/items/[id]/photos");
  }
});

export const POST = withInventoryAuth(async function POST(req: NextRequest, { params }: Params) {
  try {
    assertMutationRequest(req, "multipart/form-data");
    const { id } = await params;
    if (!(await prisma.item.findUnique({ where: { id }, select: { id: true } }))) {
      throw new ApiError(404, "Item not found.");
    }
    const files = await readPhotoUploads(req);
    // Decode the whole batch before writing anything. Serial processing bounds
    // peak decoder memory and keeps invalid later files from leaving earlier ones.
    const processed: ProcessedPhoto[] = [];
    for (const file of files) {
      processed.push(await processPhoto(Buffer.from(await file.arrayBuffer()), file.name));
    }
    // Finish filesystem writes before starting the timed database transaction.
    // Its rollback handler can then clean a complete, stable batch.
    const stored = await storePhotoFiles(processed);
    try {
      const photos = await inventoryTransaction(async (tx) => {
        const item = await tx.item.findUnique({
          where: { id },
          select: {
            photos: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true } },
          },
        });
        if (!item) throw new ApiError(404, "Item not found.");
        if (item.photos.length + processed.length > MAX_PHOTOS_PER_ITEM) {
          throw new ApiError(409, `An item can have at most ${MAX_PHOTOS_PER_ITEM} photos. Remove a photo first.`);
        }
        // Preserve selection order, even when SQLite timestamps tie to a millisecond.
        const firstTimestamp = Math.max(Date.now(), (item.photos[0]?.createdAt.getTime() ?? 0) + 1);
        await tx.itemPhoto.createMany({
          data: stored.map((photo, index) => ({
            ...photo, itemId: id, createdAt: new Date(firstTimestamp + index),
          })),
        });
        await tx.item.update({ where: { id }, data: { updatedAt: new Date() } });
        await tx.itemActivity.create({
          data: {
            itemId: id,
            type: "PHOTOS_ADDED",
            message: `Added ${stored.length} ${stored.length === 1 ? "photo" : "photos"}.`,
          },
        });
        return tx.itemPhoto.findMany({
          where: { filename: { in: stored.map((photo) => photo.filename) } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
      });
      return NextResponse.json(photos, { status: 201 });
    } catch (error) {
      // All metadata writes are rolled back together. Remove the entire batch,
      // including files created before a failed metadata insert/commit.
      await removePhotoFiles(
        stored.map((photo) => photo.filename),
        "Upload failed and photo cleanup failed. Check server logs.",
      );
      throw error;
    }
  } catch (error) {
    return apiErrorResponse(error, "POST /api/items/[id]/photos");
  }
});
