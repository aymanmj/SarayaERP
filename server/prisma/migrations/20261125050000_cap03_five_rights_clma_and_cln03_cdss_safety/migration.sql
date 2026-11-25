-- Migration #81: Phase 6 Batch 27
-- CAP03 / UI14 Full 5-Rights Closed-Loop Medication Administration (CLMA)
-- Persists verificationScope, verifiedDose, verifiedRoute, timeVarianceMinutes
-- and enforces at PostgreSQL level that isVerified5Rights = true is impossible
-- without verified barcode + dose + route + scheduled time window.

ALTER TABLE "MedicationAdministration"
  ADD COLUMN "verificationScope" VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "verifiedDose" VARCHAR(120),
  ADD COLUMN "verifiedRoute" VARCHAR(60),
  ADD COLUMN "timeVarianceMinutes" INTEGER;

ALTER TABLE "MedicationAdministration"
  ADD CONSTRAINT "MedicationAdministration_scope_chk" CHECK (
    "verificationScope" IN ('MANUAL', 'PATIENT_AND_DRUG', 'FULL_FIVE_RIGHTS')
  ),
  ADD CONSTRAINT "MedicationAdministration_five_rights_chk" CHECK (
    "isVerified5Rights" = false
    OR (
      "isBarcodeMatch" = true
      AND "verificationScope" = 'FULL_FIVE_RIGHTS'
      AND "verifiedDose" IS NOT NULL
      AND "verifiedRoute" IS NOT NULL
      AND "scheduledSlot" IS NOT NULL
      AND "timeVarianceMinutes" IS NOT NULL
    )
  );
