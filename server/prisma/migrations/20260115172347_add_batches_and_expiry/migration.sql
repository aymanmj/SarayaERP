/*
  Warnings:

  - A unique constraint covering the columns `[warehouseId,productId,batchNumber]` on the table `ProductStock` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ProductStock_warehouseId_productId_key";

-- AlterTable
ALTER TABLE "DispenseItem" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductStock" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PurchaseInvoiceLine" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StockTransaction" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ProductStock_expiryDate_idx" ON "ProductStock"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProductStock_warehouseId_productId_batchNumber_key" ON "ProductStock"("warehouseId", "productId", "batchNumber");
