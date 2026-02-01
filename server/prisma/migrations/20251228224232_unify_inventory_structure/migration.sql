/*
  Warnings:

  - You are about to drop the column `dispensedDrugItemId` on the `DispenseItem` table. All the data in the column will be lost.
  - You are about to drop the column `drugItemId` on the `PrescriptionItem` table. All the data in the column will be lost.
  - You are about to drop the column `stockTransactionId` on the `PurchaseInvoice` table. All the data in the column will be lost.
  - You are about to drop the column `drugItemId` on the `PurchaseInvoiceLine` table. All the data in the column will be lost.
  - You are about to drop the column `inventoryItemId` on the `PurchaseInvoiceLine` table. All the data in the column will be lost.
  - You are about to drop the `DrugItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InventoryItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InventoryStockTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InventoryStockTransactionLine` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PharmacyStockTransaction` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[hospitalId,name]` on the table `Warehouse` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `productId` to the `DispenseItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productId` to the `PrescriptionItem` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('DRUG', 'SUPPLY', 'ASSET', 'LAB_REAGENT', 'OTHER');

-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('IN', 'OUT', 'ADJUST');

-- DropForeignKey
ALTER TABLE "DispenseItem" DROP CONSTRAINT "DispenseItem_dispensedDrugItemId_fkey";

-- DropForeignKey
ALTER TABLE "DrugItem" DROP CONSTRAINT "DrugItem_hospitalId_fkey";

-- DropForeignKey
ALTER TABLE "DrugItem" DROP CONSTRAINT "DrugItem_purchaseAccountId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_hospitalId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_purchaseAccountId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryStockTransaction" DROP CONSTRAINT "InventoryStockTransaction_hospitalId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryStockTransaction" DROP CONSTRAINT "InventoryStockTransaction_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryStockTransactionLine" DROP CONSTRAINT "InventoryStockTransactionLine_itemId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryStockTransactionLine" DROP CONSTRAINT "InventoryStockTransactionLine_txnId_fkey";

-- DropForeignKey
ALTER TABLE "PharmacyStockTransaction" DROP CONSTRAINT "PharmacyStockTransaction_createdById_fkey";

-- DropForeignKey
ALTER TABLE "PharmacyStockTransaction" DROP CONSTRAINT "PharmacyStockTransaction_dispenseRecordId_fkey";

-- DropForeignKey
ALTER TABLE "PharmacyStockTransaction" DROP CONSTRAINT "PharmacyStockTransaction_drugItemId_fkey";

-- DropForeignKey
ALTER TABLE "PharmacyStockTransaction" DROP CONSTRAINT "PharmacyStockTransaction_hospitalId_fkey";

-- DropForeignKey
ALTER TABLE "PrescriptionItem" DROP CONSTRAINT "PrescriptionItem_drugItemId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseInvoice" DROP CONSTRAINT "PurchaseInvoice_stockTransactionId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseInvoiceLine" DROP CONSTRAINT "PurchaseInvoiceLine_drugItemId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseInvoiceLine" DROP CONSTRAINT "PurchaseInvoiceLine_inventoryItemId_fkey";

-- DropIndex
DROP INDEX "PurchaseInvoice_stockTransactionId_key";

-- DropIndex
DROP INDEX "Warehouse_hospitalId_code_key";

-- DropIndex
DROP INDEX "Warehouse_hospitalId_name_idx";

-- AlterTable
ALTER TABLE "DispenseItem" DROP COLUMN "dispensedDrugItemId",
ADD COLUMN     "productId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "PrescriptionItem" DROP COLUMN "drugItemId",
ADD COLUMN     "productId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseInvoice" DROP COLUMN "stockTransactionId";

-- AlterTable
ALTER TABLE "PurchaseInvoiceLine" DROP COLUMN "drugItemId",
DROP COLUMN "inventoryItemId",
ADD COLUMN     "productId" INTEGER;

-- DropTable
DROP TABLE "DrugItem";

-- DropTable
DROP TABLE "InventoryItem";

-- DropTable
DROP TABLE "InventoryStockTransaction";

-- DropTable
DROP TABLE "InventoryStockTransactionLine";

-- DropTable
DROP TABLE "PharmacyStockTransaction";

-- DropEnum
DROP TYPE "InventoryItemType";

-- DropEnum
DROP TYPE "InventorySourceType";

-- DropEnum
DROP TYPE "StockTxnType";

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProductType" NOT NULL DEFAULT 'DRUG',
    "genericName" TEXT,
    "strength" TEXT,
    "form" TEXT,
    "route" "MedicationRoute",
    "costPrice" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "sellPrice" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "stockOnHand" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "maxStock" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expenseAccountId" INTEGER,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransaction" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "warehouseId" INTEGER,
    "productId" INTEGER NOT NULL,
    "type" "StockTransactionType" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,3) NOT NULL,
    "totalCost" DECIMAL(18,3) NOT NULL,
    "referenceType" TEXT,
    "referenceId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER NOT NULL,
    "purchaseInvoiceId" INTEGER,
    "dispenseRecordId" INTEGER,

    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_hospitalId_name_idx" ON "Product"("hospitalId", "name");

-- CreateIndex
CREATE INDEX "Product_hospitalId_type_idx" ON "Product"("hospitalId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Product_hospitalId_code_key" ON "Product"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "StockTransaction_hospitalId_productId_idx" ON "StockTransaction"("hospitalId", "productId");

-- CreateIndex
CREATE INDEX "StockTransaction_referenceType_referenceId_idx" ON "StockTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_hospitalId_name_key" ON "Warehouse"("hospitalId", "name");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_dispenseRecordId_fkey" FOREIGN KEY ("dispenseRecordId") REFERENCES "DispenseRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
