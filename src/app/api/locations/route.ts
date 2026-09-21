import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { parseNamedEntity } from "@/lib/item-validation";
import { inventoryTransaction } from "@/lib/inventory-transactions";

export async function GET() {
  try {
    return NextResponse.json(await prisma.location.findMany({ orderBy: { name: "asc" } }));
  } catch (error) {
    return apiErrorResponse(error, "GET /api/locations");
  }
}

export async function POST(req: NextRequest) {
  try {
    const name = parseNamedEntity(await readJsonBody(req));
    const location = await inventoryTransaction((tx) =>
      tx.location.upsert({ where: { name }, update: {}, create: { name } }),
    );
    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "POST /api/locations");
  }
}
