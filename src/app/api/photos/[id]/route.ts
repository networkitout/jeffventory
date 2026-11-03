import { withInventoryAuth } from "@/lib/auth-route";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ApiError,
  apiErrorResponse,
  assertMutationRequest,
  errorCode,
  logUnexpectedError,
} from "@/lib/api-errors";
import { readPhotoFile, removePhotoFiles } from "@/lib/photos";
import { inventoryTransaction } from "@/lib/inventory-transactions";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export const GET = withInventoryAuth(async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const photo = await prisma.itemPhoto.findUnique({ where: { id } });
    if (!photo) throw new ApiError(404, "Photo not found.");
    let data: Buffer;
    try {
      data = await readPhotoFile(photo.filename);
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        logUnexpectedError("photo file missing", error);
        throw new ApiError(404, "Photo file is missing.");
      }
      throw error;
    }
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(data.length),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "GET /api/photos/[id]");
  }
});

export const DELETE = withInventoryAuth(async function DELETE(req: NextRequest, { params }: Params) {
  try {
    assertMutationRequest(req);
    const { id } = await params;
    const photo = await inventoryTransaction(async (tx) => {
      const deleted = await tx.itemPhoto.delete({ where: { id } });
      await tx.item.update({ where: { id: deleted.itemId }, data: { updatedAt: new Date() } });
      await tx.itemActivity.create({
        data: { itemId: deleted.itemId, type: "PHOTO_REMOVED", message: "Photo removed." },
      });
      return deleted;
    });
    await removePhotoFiles([photo.filename], "Photo was deleted, but file cleanup failed. Check server logs.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "DELETE /api/photos/[id]");
  }
});
