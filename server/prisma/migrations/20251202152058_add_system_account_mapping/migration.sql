-- CreateEnum
CREATE TYPE "SystemAccountKey" AS ENUM ('CASH_MAIN', 'CASH_PETTY', 'BANK_MAIN', 'RECEIVABLE_PATIENTS', 'RECEIVABLE_INSURANCE', 'REVENUE_OUTPATIENT', 'REVENUE_INPATIENT', 'REVENUE_ER', 'REVENUE_SURGERY', 'REVENUE_ICU', 'REVENUE_LAB', 'REVENUE_RADIOLOGY', 'REVENUE_PHARMACY', 'DISCOUNT_ALLOWED', 'REVENUE_WRITE_OFF', 'INVENTORY_DRUGS', 'INVENTORY_SUPPLIES', 'INVENTORY_LAB', 'INVENTORY_RADIOLOGY', 'COGS_DRUGS', 'COGS_SUPPLIES', 'COGS_LAB', 'COGS_RADIOLOGY', 'CASH_SHORT_OVER', 'ROUNDING_DIFF', 'VAT_PAYABLE', 'SALARIES_EXPENSE', 'SALARIES_PAYABLE');

-- CreateTable
CREATE TABLE "SystemAccountMapping" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "key" "SystemAccountKey" NOT NULL,
    "accountId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountingEntryId" INTEGER,

    CONSTRAINT "SystemAccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemAccountMapping_hospitalId_key_key" ON "SystemAccountMapping"("hospitalId", "key");

-- AddForeignKey
ALTER TABLE "SystemAccountMapping" ADD CONSTRAINT "SystemAccountMapping_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccountMapping" ADD CONSTRAINT "SystemAccountMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccountMapping" ADD CONSTRAINT "SystemAccountMapping_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
