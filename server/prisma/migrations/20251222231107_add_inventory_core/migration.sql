/*
  Warnings:

  - A unique constraint covering the columns `[accountingEntryId]` on the table `PurchaseInvoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stockTransactionId]` on the table `PurchaseInvoice` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "InventoryItemType" AS ENUM ('SUPPLY', 'LAB', 'RADIOLOGY', 'OTHER');

-- CreateEnum
CREATE TYPE "InventorySourceType" AS ENUM ('PURCHASE_INVOICE', 'ADJUSTMENT', 'TRANSFER', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SystemAccountKey" ADD VALUE 'VAT_RECOVERABLE';
ALTER TYPE "SystemAccountKey" ADD VALUE 'PAYABLE_SUPPLIERS';

-- AlterTable
ALTER TABLE "DrugItem" ADD COLUMN     "avgCost" DECIMAL(18,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PurchaseInvoice" ADD COLUMN     "accountingEntryId" INTEGER,
ADD COLUMN     "stockTransactionId" INTEGER,
ADD COLUMN     "warehouseId" INTEGER;

-- AlterTable
ALTER TABLE "PurchaseInvoiceLine" ADD COLUMN     "drugItemId" INTEGER,
ADD COLUMN     "inventoryItemId" INTEGER;

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" "InventoryItemType" NOT NULL DEFAULT 'SUPPLY',
    "isStockTracked" BOOLEAN NOT NULL DEFAULT true,
    "stockOnHand" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "avgCost" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStockTransaction" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "type" "StockTxnType" NOT NULL,
    "sourceType" "InventorySourceType" NOT NULL,
    "sourceId" INTEGER,
    "txnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryStockTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStockTransactionLine" (
    "id" SERIAL NOT NULL,
    "txnId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,3) NOT NULL,
    "totalCost" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "InventoryStockTransactionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Warehouse_hospitalId_name_idx" ON "Warehouse"("hospitalId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_hospitalId_code_key" ON "Warehouse"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "InventoryItem_hospitalId_name_idx" ON "InventoryItem"("hospitalId", "name");

-- CreateIndex
CREATE INDEX "InventoryItem_hospitalId_type_idx" ON "InventoryItem"("hospitalId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_hospitalId_code_key" ON "InventoryItem"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "InventoryStockTransaction_hospitalId_txnDate_idx" ON "InventoryStockTransaction"("hospitalId", "txnDate");

-- CreateIndex
CREATE INDEX "InventoryStockTransaction_hospitalId_warehouseId_idx" ON "InventoryStockTransaction"("hospitalId", "warehouseId");

-- CreateIndex
CREATE INDEX "InventoryStockTransaction_sourceType_sourceId_idx" ON "InventoryStockTransaction"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "InventoryStockTransactionLine_txnId_idx" ON "InventoryStockTransactionLine"("txnId");

-- CreateIndex
CREATE INDEX "InventoryStockTransactionLine_itemId_idx" ON "InventoryStockTransactionLine"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_accountingEntryId_key" ON "PurchaseInvoice"("accountingEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_stockTransactionId_key" ON "PurchaseInvoice"("stockTransactionId");

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_stockTransactionId_fkey" FOREIGN KEY ("stockTransactionId") REFERENCES "InventoryStockTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_drugItemId_fkey" FOREIGN KEY ("drugItemId") REFERENCES "DrugItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStockTransaction" ADD CONSTRAINT "InventoryStockTransaction_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStockTransaction" ADD CONSTRAINT "InventoryStockTransaction_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStockTransactionLine" ADD CONSTRAINT "InventoryStockTransactionLine_txnId_fkey" FOREIGN KEY ("txnId") REFERENCES "InventoryStockTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStockTransactionLine" ADD CONSTRAINT "InventoryStockTransactionLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
