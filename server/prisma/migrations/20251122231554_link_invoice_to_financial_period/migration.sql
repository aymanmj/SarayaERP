-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "financialPeriodId" INTEGER,
ADD COLUMN     "financialYearId" INTEGER;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "FinancialPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
