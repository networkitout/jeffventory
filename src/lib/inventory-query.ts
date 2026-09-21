import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { parseIds } from "@/lib/item-validation";

export const itemRelations = {
  category: true,
  location: true,
  photos: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.ItemInclude;

export function buildItemWhere(search: URLSearchParams): Prisma.ItemWhereInput {
  const q = search.get("q")?.trim();
  const status = search.get("status")?.trim();
  const categoryId = search.get("categoryId")?.trim();
  const locationId = search.get("locationId")?.trim();
  const where: Prisma.ItemWhereInput = {
    ...(status && status !== "all" ? { status } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(locationId ? { locationId } : {}),
    ...(search.has("ids") ? { id: { in: parseIds(search.get("ids")!.split(",")) } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { sku: { contains: q } },
            { upc: { contains: q } },
            { notes: { contains: q } },
            { description: { contains: q } },
            { brand: { contains: q } },
            { modelNumber: { contains: q } },
            { partNumber: { contains: q } },
            { serialNumber: { contains: q } },
            { tags: { contains: q } },
          ],
        }
      : {}),
  };
  if (search.get("lowStock") === "1") {
    where.AND = [
      { status: { in: ["IN_STOCK", "LISTED"] } },
      { lowStockThreshold: { not: null } },
      { quantity: { lte: prisma.item.fields.lowStockThreshold } },
    ];
  }
  return where;
}

export function buildItemOrderBy(search: URLSearchParams): Prisma.ItemOrderByWithRelationInput {
  switch (search.get("sort")) {
    case "name":
      return { name: "asc" };
    case "quantity":
      return { quantity: "asc" };
    case "value":
      return { listPrice: "desc" };
    default:
      return { updatedAt: "desc" };
  }
}
