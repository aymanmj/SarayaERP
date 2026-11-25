-- Migration #82: Phase 6 Batch 28
-- 1. CAP09 Period-End Unrealized FX Revaluation (FxRevaluationRun)
-- 2. CAP02 Laboratory Westgard Multi-Rule QC & Levey-Jennings (LabQcLot, LabQcRun)
-- 3. CAP13 Radiology Radiation Dose Structured Report / RDSR (RadiologyDoseRecord)

-- =========================================================================
-- 1. FxRevaluationRun
-- =========================================================================
CREATE TABLE "FxRevaluationRun" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "bankAccountId" INTEGER NOT NULL,
  "asOfDate" DATE NOT NULL,
  "currencyCode" VARCHAR(8) NOT NULL,
  "foreignBalance" DECIMAL(18,3) NOT NULL,
  "bookBalanceBase" DECIMAL(18,3) NOT NULL,
  "closingRate" DECIMAL(19,6) NOT NULL,
  "revaluedBalanceBase" DECIMAL(18,3) NOT NULL,
  "unrealizedGainLoss" DECIMAL(18,3) NOT NULL,
  "accountingEntryId" INTEGER,
  "performedById" INTEGER NOT NULL,
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FxRevaluationRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FxRevaluationRun_rate_chk" CHECK ("closingRate" > 0),
  CONSTRAINT "FxRevaluationRun_balance_chk" CHECK (("revaluedBalanceBase" - "bookBalanceBase") = "unrealizedGainLoss")
);

CREATE UNIQUE INDEX "FxRevaluationRun_accountingEntryId_key" ON "FxRevaluationRun"("accountingEntryId");
CREATE UNIQUE INDEX "FxRevaluationRun_hospitalId_bankAccountId_asOfDate_key" ON "FxRevaluationRun"("hospitalId", "bankAccountId", "asOfDate");
CREATE INDEX "FxRevaluationRun_hospitalId_asOfDate_idx" ON "FxRevaluationRun"("hospitalId", "asOfDate");

ALTER TABLE "FxRevaluationRun"
  ADD CONSTRAINT "FxRevaluationRun_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FxRevaluationRun_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FxRevaluationRun_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FxRevaluationRun_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION fx_revaluation_run_immutable_guard() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'FxRevaluationRun % is an immutable financial audit record', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fx_revaluation_run_immutable
  BEFORE UPDATE OR DELETE ON "FxRevaluationRun"
  FOR EACH ROW EXECUTE FUNCTION fx_revaluation_run_immutable_guard();

-- =========================================================================
-- 2. LabQcLot & LabQcRun (Westgard QC)
-- =========================================================================
CREATE TABLE "LabQcLot" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "testId" INTEGER NOT NULL,
  "analyzerName" VARCHAR(120) NOT NULL,
  "lotNumber" VARCHAR(64) NOT NULL,
  "level" VARCHAR(24) NOT NULL,
  "targetMean" DECIMAL(18,4) NOT NULL,
  "targetSd" DECIMAL(18,4) NOT NULL,
  "unit" VARCHAR(32),
  "expiryDate" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabQcLot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LabQcLot_sd_chk" CHECK ("targetSd" > 0),
  CONSTRAINT "LabQcLot_level_chk" CHECK ("level" IN ('LEVEL_1_LOW', 'LEVEL_2_NORMAL', 'LEVEL_3_HIGH'))
);

CREATE UNIQUE INDEX "LabQcLot_hospitalId_testId_analyzerName_lotNumber_level_key"
  ON "LabQcLot"("hospitalId", "testId", "analyzerName", "lotNumber", "level");
CREATE INDEX "LabQcLot_hospitalId_testId_isActive_idx" ON "LabQcLot"("hospitalId", "testId", "isActive");

ALTER TABLE "LabQcLot"
  ADD CONSTRAINT "LabQcLot_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LabQcLot_testId_fkey" FOREIGN KEY ("testId") REFERENCES "LabTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LabQcLot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LabQcRun" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "qcLotId" INTEGER NOT NULL,
  "measuredValue" DECIMAL(18,4) NOT NULL,
  "zScore" DECIMAL(10,4) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "violatedRules" JSONB NOT NULL,
  "correctiveAction" VARCHAR(500),
  "performedById" INTEGER NOT NULL,
  "reviewedById" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabQcRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LabQcRun_status_chk" CHECK ("status" IN ('PASS', 'WARNING', 'REJECT')),
  CONSTRAINT "LabQcRun_four_eyes_chk" CHECK ("reviewedById" IS NULL OR "reviewedById" <> "performedById")
);

CREATE INDEX "LabQcRun_hospitalId_qcLotId_measuredAt_idx" ON "LabQcRun"("hospitalId", "qcLotId", "measuredAt");
CREATE INDEX "LabQcRun_hospitalId_status_idx" ON "LabQcRun"("hospitalId", "status");

ALTER TABLE "LabQcRun"
  ADD CONSTRAINT "LabQcRun_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LabQcRun_qcLotId_fkey" FOREIGN KEY ("qcLotId") REFERENCES "LabQcLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LabQcRun_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LabQcRun_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION lab_qc_run_immutable_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LabQcRun % cannot be deleted (laboratory QC audit requirement)', OLD."id";
  END IF;
  IF OLD."measuredValue" IS DISTINCT FROM NEW."measuredValue"
     OR OLD."zScore" IS DISTINCT FROM NEW."zScore"
     OR OLD."status" IS DISTINCT FROM NEW."status"
     OR OLD."violatedRules" IS DISTINCT FROM NEW."violatedRules"
     OR OLD."performedById" IS DISTINCT FROM NEW."performedById" THEN
    RAISE EXCEPTION 'LabQcRun % analytical measurements and Westgard outcomes are immutable', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lab_qc_run_immutable
  BEFORE UPDATE OR DELETE ON "LabQcRun"
  FOR EACH ROW EXECUTE FUNCTION lab_qc_run_immutable_guard();

-- =========================================================================
-- 3. RadiologyDoseRecord (RDSR + Cumulative 12m Safety)
-- =========================================================================
CREATE TABLE "RadiologyDoseRecord" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "radiologyOrderId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "modality" VARCHAR(16) NOT NULL,
  "bodyRegion" VARCHAR(80),
  "ctdiVolMgy" DECIMAL(12,4),
  "dlpMgyCm" DECIMAL(12,4),
  "dapGyCm2" DECIMAL(12,4),
  "effectiveDoseMsv" DECIMAL(12,4) NOT NULL,
  "kvp" DECIMAL(8,2),
  "mas" DECIMAL(10,2),
  "exposureCount" INTEGER NOT NULL DEFAULT 1,
  "exceedsDrl" BOOLEAN NOT NULL DEFAULT false,
  "cumulative12mMsv" DECIMAL(12,4) NOT NULL,
  "cumulativeWarning" BOOLEAN NOT NULL DEFAULT false,
  "recordedById" INTEGER NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RadiologyDoseRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RadiologyDoseRecord_modality_chk" CHECK ("modality" IN ('CT', 'DX', 'CR', 'MG', 'RF', 'XA', 'NM', 'PT')),
  CONSTRAINT "RadiologyDoseRecord_dose_chk" CHECK ("effectiveDoseMsv" >= 0 AND "cumulative12mMsv" >= "effectiveDoseMsv" AND "exposureCount" >= 1)
);

CREATE UNIQUE INDEX "RadiologyDoseRecord_radiologyOrderId_key" ON "RadiologyDoseRecord"("radiologyOrderId");
CREATE INDEX "RadiologyDoseRecord_hospitalId_patientId_recordedAt_idx" ON "RadiologyDoseRecord"("hospitalId", "patientId", "recordedAt");
CREATE INDEX "RadiologyDoseRecord_hospitalId_modality_idx" ON "RadiologyDoseRecord"("hospitalId", "modality");

ALTER TABLE "RadiologyDoseRecord"
  ADD CONSTRAINT "RadiologyDoseRecord_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RadiologyDoseRecord_radiologyOrderId_fkey" FOREIGN KEY ("radiologyOrderId") REFERENCES "RadiologyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RadiologyDoseRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RadiologyDoseRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION radiology_dose_record_immutable_guard() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'RadiologyDoseRecord % is an immutable radiation safety audit record', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_radiology_dose_record_immutable
  BEFORE UPDATE OR DELETE ON "RadiologyDoseRecord"
  FOR EACH ROW EXECUTE FUNCTION radiology_dose_record_immutable_guard();
