-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('LOCAL', 'FOREIGN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SystemAccountKey" ADD VALUE 'PAYABLE_SUPPLIERS_LOCAL';
ALTER TYPE "SystemAccountKey" ADD VALUE 'PAYABLE_SUPPLIERS_FOREIGN';

-- AlterTable
ALTER TABLE "DrugItem" ADD COLUMN     "purchaseAccountId" INTEGER;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "purchaseAccountId" INTEGER;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "type" "SupplierType" NOT NULL DEFAULT 'LOCAL';

-- AddForeignKey
ALTER TABLE "DrugItem" ADD CONSTRAINT "DrugItem_purchaseAccountId_fkey" FOREIGN KEY ("purchaseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_purchaseAccountId_fkey" FOREIGN KEY ("purchaseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
