import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export function inventoryTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // Reserve SQLite's writer before reading limits or relationships. This
      // statement changes no rows and prevents read-then-write races (photo caps,
      // bulk membership, connectOrCreate, and activity before/after values).
      await tx.$executeRaw`UPDATE "Item" SET "quantity" = "quantity" WHERE 0`;
      return operation(tx);
    },
    { maxWait: 15_000, timeout: 15_000 },
  );
}
