import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const item = await prisma.item.findUnique({
    where: { id },
    include: { category: true, location: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const data: Prisma.ItemUpdateInput = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.sku !== undefined && body.sku.trim()) data.sku = body.sku.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.quantity !== undefined) data.quantity = Number(body.quantity);
  if (body.upc !== undefined) data.upc = body.upc?.trim() || null;
  if (body.condition !== undefined) data.condition = body.condition;
  if (body.status !== undefined) data.status = body.status;
  if (body.purchasePrice !== undefined)
    data.purchasePrice = body.purchasePrice !== "" && body.purchasePrice != null ? Number(body.purchasePrice) : null;
  if (body.listPrice !== undefined)
    data.listPrice = body.listPrice !== "" && body.listPrice != null ? Number(body.listPrice) : null;
  if (body.ebayUrl !== undefined) data.ebayUrl = body.ebayUrl?.trim() || null;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
  if (body.categoryName !== undefined) {
    data.category = body.categoryName?.trim()
      ? { connectOrCreate: { where: { name: body.categoryName.trim() }, create: { name: body.categoryName.trim() } } }
      : { disconnect: true };
  }
  if (body.locationName !== undefined) {
    data.location = body.locationName?.trim()
      ? { connectOrCreate: { where: { name: body.locationName.trim() }, create: { name: body.locationName.trim() } } }
      : { disconnect: true };
  }

  try {
    const item = await prisma.item.update({
      where: { id },
      data,
      include: { category: true, location: true },
    });
    return NextResponse.json(item);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") return NextResponse.json({ error: "SKU already exists" }, { status: 409 });
    if (err.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.item.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }
}
