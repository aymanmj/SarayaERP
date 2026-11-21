BEGIN;
-- DropForeignKey
ALTER TABLE "PurchaseReturn" DROP CONSTRAINT "PurchaseReturn_accountingEntryId_fkey";

-- AlterTable
ALTER TABLE "StockTransaction" ADD COLUMN     "purchaseReturnId" INTEGER;

-- AlterTable
ALTER TABLE "PurchaseReturn" ADD COLUMN     "requestKey" TEXT;

-- AlterTable
ALTER TABLE "PurchaseReturnLine" ADD COLUMN     "productStockId" INTEGER,
ADD COLUMN     "purchaseInvoiceLineId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_requestKey_key" ON "PurchaseReturn"("requestKey");

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_purchaseInvoiceLineId_fkey" FOREIGN KEY ("purchaseInvoiceLineId") REFERENCES "PurchaseInvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_productStockId_fkey" FOREIGN KEY ("productStockId") REFERENCES "ProductStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_atomic_completion" CHECK ("requestKey" IS NULL OR ("netAmount">0 AND "vatAmount"=0 AND "totalAmount"="netAmount" AND (status='DRAFT' OR (status='COMPLETED' AND "accountingEntryId" IS NOT NULL))));
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_original_reference" CHECK (("purchaseInvoiceLineId" IS NULL AND "productStockId" IS NULL) OR ("purchaseInvoiceLineId" IS NOT NULL AND "productStockId" IS NOT NULL AND quantity>0 AND "unitPrice">=0 AND "totalAmount">=0));
COMMIT;
