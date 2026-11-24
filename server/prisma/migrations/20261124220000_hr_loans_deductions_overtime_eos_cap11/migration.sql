-- Migration #77: CAP11 — HR Loans/Advances, Recurring Allowances/Deductions, Overtime Requests & End-of-Service Indemnity

-- 1. Extend SystemAccountKey enum
ALTER TYPE "SystemAccountKey" ADD VALUE IF NOT EXISTS 'EMPLOYEE_ADVANCES';
ALTER TYPE "SystemAccountKey" ADD VALUE IF NOT EXISTS 'EMPLOYEE_DEDUCTIONS_PAYABLE';
ALTER TYPE "SystemAccountKey" ADD VALUE IF NOT EXISTS 'EOS_EXPENSE';

-- 2. Extend User with employment lifecycle & Pay Basis classification (MONTHLY / HOURLY / FIXED_SHIFT)
ALTER TABLE "User"
  ADD COLUMN "hireDate" TIMESTAMP(3),
  ADD COLUMN "terminationDate" TIMESTAMP(3),
  ADD COLUMN "employmentStatus" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "payBasis" VARCHAR(24) NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "hourlyRate" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "fixedShift6hRate" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "fixedShift12hRate" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "fixedShift24hRate" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "standardMonthlyHours" INTEGER NOT NULL DEFAULT 160,
  ADD COLUMN "isTaxExempt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isSocialInsuranceExempt" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User"
  ADD CONSTRAINT "User_employmentStatus_chk"
  CHECK ("employmentStatus" IN ('ACTIVE', 'RESIGNED', 'TERMINATED', 'END_OF_CONTRACT', 'RETIRED')),
  ADD CONSTRAINT "User_payBasis_chk"
  CHECK ("payBasis" IN ('MONTHLY', 'HOURLY', 'FIXED_SHIFT')),
  ADD CONSTRAINT "User_rates_nonneg_chk"
  CHECK ("hourlyRate" >= 0 AND "fixedShift6hRate" >= 0 AND "fixedShift12hRate" >= 0 AND "fixedShift24hRate" >= 0 AND "standardMonthlyHours" > 0);

-- 3. Extend PayrollSlip with granular CAP11 settlement & pay-basis audit fields
ALTER TABLE "PayrollSlip"
  ADD COLUMN "payBasis" VARCHAR(24) NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "workedHours" DECIMAL(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN "workedShiftsCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxDeduction" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "advanceDeduction" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "recurringDeduction" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "unpaidLeaveDeduction" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "overtimePay" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "loanInstallmentsJson" JSONB;

-- 4. EmployeeAdvance (Loans / Salary Advances with 4-Eyes Approval)
CREATE TABLE "EmployeeAdvance" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "advanceNumber" VARCHAR(48) NOT NULL,
  "amount" DECIMAL(18,3) NOT NULL,
  "installments" INTEGER NOT NULL DEFAULT 1,
  "monthlyDeduction" DECIMAL(18,3) NOT NULL,
  "remainingAmount" DECIMAL(18,3) NOT NULL,
  "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" VARCHAR(500),
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "requestedById" INTEGER NOT NULL,
  "approvedById" INTEGER,
  "approvedAt" TIMESTAMP(3),
  "disbursementEntryId" INTEGER,
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmployeeAdvance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeAdvance_amount_chk" CHECK ("amount" > 0),
  CONSTRAINT "EmployeeAdvance_installments_chk" CHECK ("installments" >= 1),
  CONSTRAINT "EmployeeAdvance_monthlyDeduction_chk" CHECK ("monthlyDeduction" > 0),
  CONSTRAINT "EmployeeAdvance_remaining_chk" CHECK ("remainingAmount" >= 0 AND "remainingAmount" <= "amount"),
  CONSTRAINT "EmployeeAdvance_status_chk" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'SETTLED', 'CANCELLED')),
  CONSTRAINT "EmployeeAdvance_4eyes_chk" CHECK ("approvedById" IS NULL OR "approvedById" <> "userId")
);

CREATE UNIQUE INDEX "EmployeeAdvance_disbursementEntryId_key" ON "EmployeeAdvance"("disbursementEntryId");
CREATE UNIQUE INDEX "EmployeeAdvance_hospitalId_advanceNumber_key" ON "EmployeeAdvance"("hospitalId", "advanceNumber");
CREATE INDEX "EmployeeAdvance_hospitalId_userId_status_idx" ON "EmployeeAdvance"("hospitalId", "userId", "status");
CREATE INDEX "EmployeeAdvance_hospitalId_status_idx" ON "EmployeeAdvance"("hospitalId", "status");

ALTER TABLE "EmployeeAdvance"
  ADD CONSTRAINT "EmployeeAdvance_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeAdvance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeAdvance_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeAdvance_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeAdvance_disbursementEntryId_fkey" FOREIGN KEY ("disbursementEntryId") REFERENCES "AccountingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION employee_advance_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot delete non-PENDING EmployeeAdvance %', OLD."id";
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" IN ('SETTLED', 'REJECTED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Finalized EmployeeAdvance % is immutable', OLD."id";
    END IF;
    IF OLD."status" = 'APPROVED' THEN
      IF NEW."hospitalId" <> OLD."hospitalId"
         OR NEW."userId" <> OLD."userId"
         OR NEW."amount" <> OLD."amount"
         OR NEW."installments" <> OLD."installments"
         OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById" THEN
        RAISE EXCEPTION 'Approved EmployeeAdvance % core financial fields are immutable', OLD."id";
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employee_advance_guard
  BEFORE UPDATE OR DELETE ON "EmployeeAdvance"
  FOR EACH ROW EXECUTE FUNCTION employee_advance_guard();

-- 5. EmployeeDeduction (Recurring & One-Time Allowances / Deductions / Penalties)
CREATE TABLE "EmployeeDeduction" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "kind" VARCHAR(24) NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "amount" DECIMAL(18,3) NOT NULL,
  "isRecurring" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "appliedInPayrollRunId" INTEGER,
  "createdById" INTEGER NOT NULL,
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmployeeDeduction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeDeduction_kind_chk" CHECK ("kind" IN ('DEDUCTION', 'ALLOWANCE')),
  CONSTRAINT "EmployeeDeduction_amount_chk" CHECK ("amount" > 0),
  CONSTRAINT "EmployeeDeduction_dates_chk" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE INDEX "EmployeeDeduction_hospitalId_userId_isActive_idx" ON "EmployeeDeduction"("hospitalId", "userId", "isActive");
CREATE INDEX "EmployeeDeduction_hospitalId_kind_isActive_idx" ON "EmployeeDeduction"("hospitalId", "kind", "isActive");

ALTER TABLE "EmployeeDeduction"
  ADD CONSTRAINT "EmployeeDeduction_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeDeduction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeDeduction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeDeduction_appliedInPayrollRunId_fkey" FOREIGN KEY ("appliedInPayrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. OvertimeRequest (Approved Overtime with 4-Eyes & Day-Type Multipliers)
CREATE TABLE "OvertimeRequest" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "requestedHours" DECIMAL(10,3) NOT NULL,
  "approvedHours" DECIMAL(10,3),
  "dayType" VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  "multiplier" DECIMAL(10,3) NOT NULL DEFAULT 1.5,
  "reason" VARCHAR(500) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
  "requestedById" INTEGER NOT NULL,
  "approvedById" INTEGER,
  "approvedAt" TIMESTAMP(3),
  "appliedInPayrollRunId" INTEGER,
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OvertimeRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OvertimeRequest_reqHours_chk" CHECK ("requestedHours" > 0 AND "requestedHours" <= 24),
  CONSTRAINT "OvertimeRequest_appHours_chk" CHECK ("approvedHours" IS NULL OR ("approvedHours" > 0 AND "approvedHours" <= 24)),
  CONSTRAINT "OvertimeRequest_dayType_chk" CHECK ("dayType" IN ('NORMAL', 'WEEKEND', 'HOLIDAY')),
  CONSTRAINT "OvertimeRequest_multiplier_chk" CHECK ("multiplier" > 0 AND "multiplier" <= 5),
  CONSTRAINT "OvertimeRequest_status_chk" CHECK ("status" IN ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  CONSTRAINT "OvertimeRequest_4eyes_chk" CHECK ("approvedById" IS NULL OR "approvedById" <> "userId")
);

CREATE INDEX "OvertimeRequest_hospitalId_userId_date_idx" ON "OvertimeRequest"("hospitalId", "userId", "date");
CREATE INDEX "OvertimeRequest_hospitalId_status_date_idx" ON "OvertimeRequest"("hospitalId", "status", "date");

ALTER TABLE "OvertimeRequest"
  ADD CONSTRAINT "OvertimeRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OvertimeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OvertimeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OvertimeRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OvertimeRequest_appliedInPayrollRunId_fkey" FOREIGN KEY ("appliedInPayrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION overtime_request_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'APPROVED' THEN
      RAISE EXCEPTION 'Cannot delete APPROVED OvertimeRequest %', OLD."id";
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'APPROVED' THEN
      IF NEW."status" <> 'APPROVED'
         OR NEW."approvedHours" IS DISTINCT FROM OLD."approvedHours"
         OR NEW."multiplier" <> OLD."multiplier"
         OR NEW."userId" <> OLD."userId"
         OR (OLD."appliedInPayrollRunId" IS NOT NULL AND NEW."appliedInPayrollRunId" IS DISTINCT FROM OLD."appliedInPayrollRunId") THEN
        RAISE EXCEPTION 'Approved OvertimeRequest % is immutable', OLD."id";
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_overtime_request_guard
  BEFORE UPDATE OR DELETE ON "OvertimeRequest"
  FOR EACH ROW EXECUTE FUNCTION overtime_request_guard();

-- 7. EmployeeSettlement (End-of-Service Indemnity & 4-Department Clearance)
CREATE TABLE "EmployeeSettlement" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "settlementNo" VARCHAR(48) NOT NULL,
  "terminationType" VARCHAR(24) NOT NULL,
  "hireDate" TIMESTAMP(3) NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "reason" VARCHAR(500),
  "serviceYears" DECIMAL(10,3) NOT NULL DEFAULT 0,
  "serviceMonths" INTEGER NOT NULL DEFAULT 0,
  "serviceDays" INTEGER NOT NULL DEFAULT 0,
  "basicSalary" DECIMAL(18,3) NOT NULL,
  "dailyRate" DECIMAL(18,3) NOT NULL,
  "lastMonthDays" INTEGER NOT NULL DEFAULT 0,
  "lastMonthAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "leaveDaysUnused" DECIMAL(10,3) NOT NULL DEFAULT 0,
  "leaveCompensationAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "gratuityAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "otherAdditions" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "additionsNotes" VARCHAR(500),
  "totalEarnings" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "advancesDeduction" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "otherDeductions" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "deductionsNotes" VARCHAR(500),
  "totalDeductions" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "netAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "isDepartmentCleared" BOOLEAN NOT NULL DEFAULT false,
  "isItCleared" BOOLEAN NOT NULL DEFAULT false,
  "isFinanceCleared" BOOLEAN NOT NULL DEFAULT false,
  "isHrCleared" BOOLEAN NOT NULL DEFAULT false,
  "clearanceNotes" VARCHAR(500),
  "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  "createdById" INTEGER NOT NULL,
  "approvedById" INTEGER,
  "approvedAt" TIMESTAMP(3),
  "paidById" INTEGER,
  "paidAt" TIMESTAMP(3),
  "accrualEntryId" INTEGER,
  "paymentEntryId" INTEGER,
  "executionSnapshot" JSONB,
  "signatureHash" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmployeeSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeSettlement_termType_chk" CHECK ("terminationType" IN ('RESIGNATION', 'TERMINATION', 'END_OF_CONTRACT', 'RETIREMENT', 'DISCIPLINARY', 'PROBATION_FAILURE')),
  CONSTRAINT "EmployeeSettlement_status_chk" CHECK ("status" IN ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED')),
  CONSTRAINT "EmployeeSettlement_earnings_chk" CHECK ("totalEarnings" = "lastMonthAmount" + "leaveCompensationAmount" + "gratuityAmount" + "otherAdditions"),
  CONSTRAINT "EmployeeSettlement_deductions_chk" CHECK ("totalDeductions" = "advancesDeduction" + "otherDeductions"),
  CONSTRAINT "EmployeeSettlement_net_chk" CHECK ("netAmount" = "totalEarnings" - "totalDeductions"),
  CONSTRAINT "EmployeeSettlement_4eyes_chk" CHECK ("approvedById" IS NULL OR ("approvedById" <> "userId" AND "approvedById" <> "createdById")),
  CONSTRAINT "EmployeeSettlement_approval_gate_chk" CHECK (
    "status" NOT IN ('APPROVED', 'PAID')
    OR ("isDepartmentCleared" = true AND "isItCleared" = true AND "isFinanceCleared" = true AND "isHrCleared" = true AND "approvedById" IS NOT NULL AND "signatureHash" IS NOT NULL)
  ),
  CONSTRAINT "EmployeeSettlement_paid_gate_chk" CHECK ("status" <> 'PAID' OR ("paidById" IS NOT NULL AND "paidAt" IS NOT NULL))
);

CREATE UNIQUE INDEX "EmployeeSettlement_accrualEntryId_key" ON "EmployeeSettlement"("accrualEntryId");
CREATE UNIQUE INDEX "EmployeeSettlement_paymentEntryId_key" ON "EmployeeSettlement"("paymentEntryId");
CREATE UNIQUE INDEX "EmployeeSettlement_hospitalId_settlementNo_key" ON "EmployeeSettlement"("hospitalId", "settlementNo");
CREATE INDEX "EmployeeSettlement_hospitalId_userId_status_idx" ON "EmployeeSettlement"("hospitalId", "userId", "status");
CREATE INDEX "EmployeeSettlement_hospitalId_status_effectiveDate_idx" ON "EmployeeSettlement"("hospitalId", "status", "effectiveDate");

ALTER TABLE "EmployeeSettlement"
  ADD CONSTRAINT "EmployeeSettlement_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeSettlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeSettlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeSettlement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeSettlement_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeSettlement_accrualEntryId_fkey" FOREIGN KEY ("accrualEntryId") REFERENCES "AccountingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeSettlement_paymentEntryId_fkey" FOREIGN KEY ("paymentEntryId") REFERENCES "AccountingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION employee_settlement_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('APPROVED', 'PAID') THEN
      RAISE EXCEPTION 'Finalized EmployeeSettlement % is immutable and cannot be deleted', OLD."id";
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" IN ('PAID', 'CANCELLED') THEN
      RAISE EXCEPTION 'Finalized EmployeeSettlement % is immutable', OLD."id";
    END IF;
    IF OLD."status" = 'APPROVED' THEN
      IF NEW."status" <> 'PAID'
         OR NEW."hospitalId" <> OLD."hospitalId"
         OR NEW."userId" <> OLD."userId"
         OR NEW."totalEarnings" <> OLD."totalEarnings"
         OR NEW."totalDeductions" <> OLD."totalDeductions"
         OR NEW."netAmount" <> OLD."netAmount"
         OR NEW."signatureHash" IS DISTINCT FROM OLD."signatureHash"
         OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById" THEN
        RAISE EXCEPTION 'Approved EmployeeSettlement % is immutable except for APPROVED -> PAID payment recording', OLD."id";
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employee_settlement_guard
  BEFORE UPDATE OR DELETE ON "EmployeeSettlement"
  FOR EACH ROW EXECUTE FUNCTION employee_settlement_guard();

-- 8. TaxBracket (Multi-Tenant Progressive Income Tax Brackets)
CREATE TABLE "TaxBracket" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "fromAmount" DECIMAL(18,3) NOT NULL,
  "toAmount" DECIMAL(18,3),
  "rate" DECIMAL(19,6) NOT NULL,
  "fixedAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TaxBracket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaxBracket_from_chk" CHECK ("fromAmount" >= 0),
  CONSTRAINT "TaxBracket_to_chk" CHECK ("toAmount" IS NULL OR "toAmount" > "fromAmount"),
  CONSTRAINT "TaxBracket_rate_chk" CHECK ("rate" >= 0 AND "rate" <= 1),
  CONSTRAINT "TaxBracket_fixed_chk" CHECK ("fixedAmount" >= 0)
);

CREATE INDEX "TaxBracket_hospitalId_isActive_sortOrder_idx" ON "TaxBracket"("hospitalId", "isActive", "sortOrder");

ALTER TABLE "TaxBracket"
  ADD CONSTRAINT "TaxBracket_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
