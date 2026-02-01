-- AlterTable
ALTER TABLE "CashierShiftClosing" ADD COLUMN     "accountingEntryId" INTEGER;

-- CreateIndex
CREATE INDEX "CashierShiftClosing_accountingEntryId_idx" ON "CashierShiftClosing"("accountingEntryId");

-- AddForeignKey
ALTER TABLE "CashierShiftClosing" ADD CONSTRAINT "CashierShiftClosing_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
