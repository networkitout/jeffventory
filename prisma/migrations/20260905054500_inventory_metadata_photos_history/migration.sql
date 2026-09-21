-- Add nullable metadata without rebuilding or modifying existing inventory rows.
ALTER TABLE "Item" ADD COLUMN "brand" TEXT;
ALTER TABLE "Item" ADD COLUMN "modelNumber" TEXT;
ALTER TABLE "Item" ADD COLUMN "partNumber" TEXT;
ALTER TABLE "Item" ADD COLUMN "serialNumber" TEXT;
ALTER TABLE "Item" ADD COLUMN "tags" TEXT;
ALTER TABLE "Item" ADD COLUMN "lowStockThreshold" INTEGER;
ALTER TABLE "Item" ADD COLUMN "salePrice" REAL;
ALTER TABLE "Item" ADD COLUMN "fees" REAL;
ALTER TABLE "Item" ADD COLUMN "shippingCost" REAL;

CREATE TABLE "ItemPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemPhoto_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ItemActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemActivity_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Item_categoryId_idx" ON "Item"("categoryId");
CREATE INDEX "Item_locationId_idx" ON "Item"("locationId");
CREATE INDEX "Item_updatedAt_idx" ON "Item"("updatedAt");
CREATE UNIQUE INDEX "ItemPhoto_filename_key" ON "ItemPhoto"("filename");
CREATE INDEX "ItemPhoto_itemId_createdAt_id_idx" ON "ItemPhoto"("itemId", "createdAt", "id");
CREATE INDEX "ItemActivity_itemId_createdAt_id_idx" ON "ItemActivity"("itemId", "createdAt", "id");
