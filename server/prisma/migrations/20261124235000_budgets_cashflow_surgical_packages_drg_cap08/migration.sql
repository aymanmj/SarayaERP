-- Migration #79: Corporate Budgets (BudgetLine) + CAP08 Surgical Packages & DRG Bundled Billing

-- 1. BudgetLine (Multi-Tenant Financial Budgets per Financial Year, Account & Optional Cost Center)
CREATE TABLE "BudgetLine" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "financialYearId" INTEGER NOT NULL,
  "accountId" INTEGER NOT NULL,
  "costCenterId" INTEGER,
  "period1" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "period2" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "period3" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "period4" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "period5" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "period6" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "period7" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "period8" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "period9" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "period10" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "period11" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "period12" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalBudget" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "notes" VARCHAR(500),
  "createdById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BudgetLine_total_chk" CHECK (
    "totalBudget" = "period1" + "period2" + "period3" + "period4" + "period5" + "period6"
                  + "period7" + "period8" + "period9" + "period10" + "period11" + "period12"
  )
);

CREATE INDEX "BudgetLine_hospitalId_financialYearId_idx" ON "BudgetLine"("hospitalId", "financialYearId");
CREATE INDEX "BudgetLine_hospitalId_financialYearId_accountId_costCenterI_idx" ON "BudgetLine"("hospitalId", "financialYearId", "accountId", "costCenterId");

ALTER TABLE "BudgetLine"
  ADD CONSTRAINT "BudgetLine_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BudgetLine_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BudgetLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BudgetLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BudgetLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. SurgicalPackage (CAP08 — Bundled Surgical & DRG Packages)
CREATE TABLE "SurgicalPackage" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "code" VARCHAR(48) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "nameEn" VARCHAR(180),
  "drgCode" VARCHAR(32),
  "description" VARCHAR(500),
  "packagePrice" DECIMAL(18,3) NOT NULL,
  "includedStayDays" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SurgicalPackage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SurgicalPackage_price_chk" CHECK ("packagePrice" > 0),
  CONSTRAINT "SurgicalPackage_stay_chk" CHECK ("includedStayDays" >= 0)
);

CREATE UNIQUE INDEX "SurgicalPackage_hospitalId_code_key" ON "SurgicalPackage"("hospitalId", "code");
CREATE INDEX "SurgicalPackage_hospitalId_isActive_idx" ON "SurgicalPackage"("hospitalId", "isActive");

ALTER TABLE "SurgicalPackage"
  ADD CONSTRAINT "SurgicalPackage_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SurgicalPackage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. SurgicalPackageInclusion (Per-Category Caps & Exclusions)
CREATE TABLE "SurgicalPackageInclusion" (
  "id" SERIAL NOT NULL,
  "packageId" INTEGER NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "coverageMode" VARCHAR(24) NOT NULL,
  "capAmount" DECIMAL(18,3),
  "notes" VARCHAR(300),

  CONSTRAINT "SurgicalPackageInclusion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SurgicalPackageInclusion_cat_chk" CHECK ("category" IN ('ROOM', 'SURGERY', 'ANESTHESIA', 'LAB', 'RADIOLOGY', 'PHARMACY', 'CONSUMABLES', 'CONSULTATION', 'PROCEDURE')),
  CONSTRAINT "SurgicalPackageInclusion_mode_chk" CHECK ("coverageMode" IN ('INCLUDED_UNLIMITED', 'INCLUDED_CAPPED', 'EXCLUDED')),
  CONSTRAINT "SurgicalPackageInclusion_cap_chk" CHECK ("coverageMode" <> 'INCLUDED_CAPPED' OR ("capAmount" IS NOT NULL AND "capAmount" >= 0))
);

CREATE UNIQUE INDEX "SurgicalPackageInclusion_packageId_category_key" ON "SurgicalPackageInclusion"("packageId", "category");

ALTER TABLE "SurgicalPackageInclusion"
  ADD CONSTRAINT "SurgicalPackageInclusion_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SurgicalPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. EncounterPackageEnrollment (Active / Settled DRG Package Reconciliation & Overage Billing)
CREATE TABLE "EncounterPackageEnrollment" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "encounterId" INTEGER NOT NULL,
  "packageId" INTEGER NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  "packagePriceSnapshot" DECIMAL(18,3) NOT NULL,
  "actualChargesTotal" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "coveredByPackageAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "overageAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "netBillableTotal" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "packageVariance" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "breakdownJson" JSONB,
  "enrolledById" INTEGER NOT NULL,
  "settledById" INTEGER,
  "settledAt" TIMESTAMP(3),
  "signatureHash" VARCHAR(64),
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EncounterPackageEnrollment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EncounterPackageEnrollment_status_chk" CHECK ("status" IN ('ACTIVE', 'SETTLED', 'CANCELLED')),
  CONSTRAINT "EncounterPackageEnrollment_amounts_chk" CHECK ("packagePriceSnapshot" > 0 AND "actualChargesTotal" >= 0 AND "coveredByPackageAmount" >= 0 AND "overageAmount" >= 0),
  CONSTRAINT "EncounterPackageEnrollment_settled_chk" CHECK (
    "status" <> 'SETTLED'
    OR ("netBillableTotal" = "packagePriceSnapshot" + "overageAmount" AND "settledById" IS NOT NULL AND "settledAt" IS NOT NULL AND "signatureHash" IS NOT NULL)
  )
);

CREATE INDEX "EncounterPackageEnrollment_hospitalId_encounterId_status_idx" ON "EncounterPackageEnrollment"("hospitalId", "encounterId", "status");
CREATE INDEX "EncounterPackageEnrollment_hospitalId_packageId_idx" ON "EncounterPackageEnrollment"("hospitalId", "packageId");
CREATE UNIQUE INDEX "EncounterPackageEnrollment_active_encounter_uidx"
  ON "EncounterPackageEnrollment"("encounterId")
  WHERE "status" IN ('ACTIVE', 'SETTLED');

ALTER TABLE "EncounterPackageEnrollment"
  ADD CONSTRAINT "EncounterPackageEnrollment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EncounterPackageEnrollment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EncounterPackageEnrollment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SurgicalPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EncounterPackageEnrollment_enrolledById_fkey" FOREIGN KEY ("enrolledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EncounterPackageEnrollment_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION encounter_package_enrollment_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'SETTLED' THEN
      RAISE EXCEPTION 'Settled EncounterPackageEnrollment % is immutable and cannot be deleted', OLD."id";
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" IN ('SETTLED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Finalized EncounterPackageEnrollment % is immutable', OLD."id";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_encounter_package_enrollment_guard
  BEFORE UPDATE OR DELETE ON "EncounterPackageEnrollment"
  FOR EACH ROW EXECUTE FUNCTION encounter_package_enrollment_guard();
