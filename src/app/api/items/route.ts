import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateSku } from "@/lib/sku";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const status = sp.get("status") ?? undefined;
  const categoryId = sp.get("categoryId") ?? undefined;
  const locationId = sp.get("locationId") ?? undefined;

  const where: Prisma.ItemWhereInput = {
    ...(status ? { status } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(locationId ? { locationId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { sku: { contains: q } },
            { upc: { contains: q } },
            { notes: { contains: q } },
            { description: { contains: q } },
          ],
        }
      : {}),
  };

  const items = await prisma.item.findMany({
    where,
    include: { category: true, location: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const item = await prisma.item.create({
      data: {
        sku: body.sku?.trim() || generateSku(),
        name: body.name.trim(),
        description: body.description?.trim() || null,
        quantity: Number.isFinite(Number(body.quantity)) ? Number(body.quantity) : 1,
        upc: body.upc?.trim() || null,
        condition: body.condition || "USED",
        status: body.status || "IN_STOCK",
        purchasePrice: body.purchasePrice != null && body.purchasePrice !== "" ? Number(body.purchasePrice) : null,
        listPrice: body.listPrice != null && body.listPrice !== "" ? Number(body.listPrice) : null,
        ebayUrl: body.ebayUrl?.trim() || null,
        notes: body.notes?.trim() || null,
        ...(body.categoryName?.trim()
          ? { category: { connectOrCreate: { where: { name: body.categoryName.trim() }, create: { name: body.categoryName.trim() } } } }
          : {}),
        ...(body.locationName?.trim()
          ? { location: { connectOrCreate: { where: { name: body.locationName.trim() }, create: { name: body.locationName.trim() } } } }
          : {}),
      },
      include: { category: true, location: true },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json({ error: "SKU already exists" }, { status: 409 });
    }
    throw e;
  }
}
