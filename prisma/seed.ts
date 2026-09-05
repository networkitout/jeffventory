import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  }),
});

async function main() {
  const categories = ["Electronics", "Components", "Cables & Adapters", "Tools", "Media"];
  const locations = ["Shelf A1", "Shelf A2", "Bin 01", "Garage", "Office Closet"];

  for (const name of categories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const name of locations) {
    await prisma.location.upsert({ where: { name }, update: {}, create: { name } });
  }

  const electronics = await prisma.category.findUnique({ where: { name: "Electronics" } });
  const components = await prisma.category.findUnique({ where: { name: "Components" } });
  const shelfA1 = await prisma.location.findUnique({ where: { name: "Shelf A1" } });
  const bin01 = await prisma.location.findUnique({ where: { name: "Bin 01" } });

  await prisma.item.upsert({
    where: { sku: "JV-SAMPLE" },
    update: {},
    create: {
      sku: "JV-SAMPLE",
      name: "Raspberry Pi 4 Model B (4GB)",
      description: "Single-board computer, boxed with original packaging.",
      quantity: 1,
      upc: "765756931182",
      condition: "LIKE_NEW",
      status: "IN_STOCK",
      purchasePrice: 55,
      listPrice: 79.99,
      categoryId: electronics?.id,
      locationId: shelfA1?.id,
      notes: "Tested and working. Includes heatsinks.",
    },
  });

  await prisma.item.upsert({
    where: { sku: "JV-SAMPL2" },
    update: {},
    create: {
      sku: "JV-SAMPL2",
      name: "Assorted 0.1uF Ceramic Capacitors (x200)",
      quantity: 200,
      condition: "NEW",
      status: "IN_STOCK",
      categoryId: components?.id,
      locationId: bin01?.id,
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
