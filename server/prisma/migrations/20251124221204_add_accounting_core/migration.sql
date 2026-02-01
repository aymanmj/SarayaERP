-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'CONTRA_ASSET', 'CONTRA_REVENUE');

-- CreateEnum
CREATE TYPE "AccountingSourceModule" AS ENUM ('BILLING', 'PAYROLL', 'INVENTORY', 'MANUAL');

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingEntry" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "financialYearId" INTEGER,
    "financialPeriodId" INTEGER,
    "sourceModule" "AccountingSourceModule" NOT NULL,
    "sourceId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingEntryLine" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "description" TEXT,
    "debit" DECIMAL(14,3) NOT NULL,
    "credit" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_hospitalId_type_idx" ON "Account"("hospitalId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Account_hospitalId_code_key" ON "Account"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "AccountingEntry_hospitalId_entryDate_idx" ON "AccountingEntry"("hospitalId", "entryDate");

-- CreateIndex
CREATE INDEX "AccountingEntry_hospitalId_financialYearId_financialPeriodI_idx" ON "AccountingEntry"("hospitalId", "financialYearId", "financialPeriodId");

-- CreateIndex
CREATE INDEX "AccountingEntry_sourceModule_sourceId_idx" ON "AccountingEntry"("sourceModule", "sourceId");

-- CreateIndex
CREATE INDEX "AccountingEntryLine_accountId_idx" ON "AccountingEntryLine"("accountId");

-- CreateIndex
CREATE INDEX "AccountingEntryLine_entryId_idx" ON "AccountingEntryLine"("entryId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntryLine" ADD CONSTRAINT "AccountingEntryLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntryLine" ADD CONSTRAINT "AccountingEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
