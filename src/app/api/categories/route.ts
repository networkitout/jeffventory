import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { parseNamedEntity } from "@/lib/item-validation";
import { inventoryTransaction } from "@/lib/inventory-transactions";

export async function GET() {
  try {
    return NextResponse.json(await prisma.category.findMany({ orderBy: { name: "asc" } }));
  } catch (error) {
    return apiErrorResponse(error, "GET /api/categories");
  }
}

export async function POST(req: NextRequest) {
  try {
    const name = parseNamedEntity(await readJsonBody(req));
    const category = await inventoryTransaction((tx) =>
      tx.category.upsert({ where: { name }, update: {}, create: { name } }),
    );
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "POST /api/categories");
  }
}
