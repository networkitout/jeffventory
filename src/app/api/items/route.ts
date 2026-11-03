import { withInventoryAuth } from "@/lib/auth-route";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateSku } from "@/lib/sku";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { parseItemCreate } from "@/lib/item-validation";
import { buildItemOrderBy, buildItemWhere, itemRelations } from "@/lib/inventory-query";
import { inventoryTransaction } from "@/lib/inventory-transactions";

export const GET = withInventoryAuth(async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams;
    const items = await prisma.item.findMany({
      where: buildItemWhere(search),
      include: itemRelations,
      orderBy: [buildItemOrderBy(search), { id: "asc" }],
    });
    return NextResponse.json(items);
  } catch (error) {
    return apiErrorResponse(error, "GET /api/items");
  }
});

export const POST = withInventoryAuth(async function POST(req: NextRequest) {
  try {
    const { categoryName, locationName, sku, ...fields } = parseItemCreate(await readJsonBody(req));
    const item = await inventoryTransaction((tx) =>
      tx.item.create({
        data: {
          ...fields,
          sku: sku ?? generateSku(),
          ...(categoryName
            ? { category: { connectOrCreate: { where: { name: categoryName }, create: { name: categoryName } } } }
            : {}),
          ...(locationName
            ? { location: { connectOrCreate: { where: { name: locationName }, create: { name: locationName } } } }
            : {}),
          activities: {
            create: { type: "CREATED", message: `Item created with quantity ${fields.quantity}.` },
          },
        },
        include: itemRelations,
      }),
    );
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "POST /api/items", "SKU already exists.");
  }
});
