-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "totalBasic" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "totalAllowances" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" INTEGER,
    "approvedById" INTEGER,
    "accountingEntryId" INTEGER,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSlip" (
    "id" SERIAL NOT NULL,
    "payrollRunId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "basicSalary" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "housingAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "otherAllowance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "PayrollSlip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_accountingEntryId_key" ON "PayrollRun"("accountingEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_hospitalId_month_year_key" ON "PayrollRun"("hospitalId", "month", "year");

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
