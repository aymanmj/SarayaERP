-- CreateEnum
CREATE TYPE "StockTxnType" AS ENUM ('IN', 'OUT', 'ADJUST');

-- AlterTable
ALTER TABLE "DrugItem" ADD COLUMN     "stockOnHand" DECIMAL(18,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PharmacyStockTransaction" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "drugItemId" INTEGER NOT NULL,
    "dispenseRecordId" INTEGER,
    "type" "StockTxnType" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER NOT NULL,

    CONSTRAINT "PharmacyStockTransaction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PharmacyStockTransaction" ADD CONSTRAINT "PharmacyStockTransaction_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyStockTransaction" ADD CONSTRAINT "PharmacyStockTransaction_drugItemId_fkey" FOREIGN KEY ("drugItemId") REFERENCES "DrugItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyStockTransaction" ADD CONSTRAINT "PharmacyStockTransaction_dispenseRecordId_fkey" FOREIGN KEY ("dispenseRecordId") REFERENCES "DispenseRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyStockTransaction" ADD CONSTRAINT "PharmacyStockTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
