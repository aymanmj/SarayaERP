-- LAB-UPGRADE-P0/P1: Multi-tenant LabTest.code, Result Verification/Amendments, Age/Sex Reference Ranges & JCI Critical Read-Back
-- Migration #73

-- 1. Drop global unique index on LabTest.code so multiple hospitals can share standard codes (e.g. CBC, BMP)
DROP INDEX IF EXISTS "LabTest_code_key";

-- 2. Extend LabOrder with verification, signature hash, and amendment tracking
ALTER TABLE "LabOrder"
    ADD COLUMN "enteredById" INTEGER,
    ADD COLUMN "enteredAt" TIMESTAMP(3),
    ADD COLUMN "isVerified" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "verifiedById" INTEGER,
    ADD COLUMN "verifiedAt" TIMESTAMP(3),
    ADD COLUMN "verificationHash" VARCHAR(64),
    ADD COLUMN "isAmended" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "amendedAt" TIMESTAMP(3),
    ADD COLUMN "lastAmendmentReason" VARCHAR(500);

ALTER TABLE "LabOrder"
    ADD CONSTRAINT "LabOrder_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "LabOrder_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "LabOrder_verified_integrity_chk" CHECK (
        "isVerified" = false
        OR ("verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "verificationHash" IS NOT NULL)
    );

-- 3. Structured Age/Sex Reference Ranges
CREATE TABLE "LabReferenceRange" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "labTestId" INTEGER NOT NULL,
    "parameterId" INTEGER,
    "gender" VARCHAR(16) NOT NULL DEFAULT 'ANY',
    "ageMinDays" INTEGER NOT NULL DEFAULT 0,
    "ageMaxDays" INTEGER NOT NULL DEFAULT 50000,
    "normalLow" DECIMAL(14,4),
    "normalHigh" DECIMAL(14,4),
    "criticalLow" DECIMAL(14,4),
    "criticalHigh" DECIMAL(14,4),
    "unit" VARCHAR(40),
    "textRange" VARCHAR(120),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabReferenceRange_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LabReferenceRange_gender_chk" CHECK ("gender" IN ('ANY', 'MALE', 'FEMALE')),
    CONSTRAINT "LabReferenceRange_age_chk" CHECK ("ageMinDays" >= 0 AND "ageMaxDays" >= "ageMinDays"),
    CONSTRAINT "LabReferenceRange_normal_chk" CHECK ("normalLow" IS NULL OR "normalHigh" IS NULL OR "normalLow" <= "normalHigh"),
    CONSTRAINT "LabReferenceRange_critical_chk" CHECK ("criticalLow" IS NULL OR "criticalHigh" IS NULL OR "criticalLow" <= "criticalHigh")
);

CREATE INDEX "LabReferenceRange_hospitalId_labTestId_parameterId_isActive_idx"
    ON "LabReferenceRange"("hospitalId", "labTestId", "parameterId", "isActive");

ALTER TABLE "LabReferenceRange"
    ADD CONSTRAINT "LabReferenceRange_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabReferenceRange_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabReferenceRange_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "LabTestParameter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. JCI IPSG.2 Critical Value Escalation & Read-Back Log
CREATE TABLE "LabCriticalNotification" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "labOrderId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "parameterName" VARCHAR(120) NOT NULL,
    "criticalValue" VARCHAR(80) NOT NULL,
    "unit" VARCHAR(40),
    "flag" VARCHAR(16) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "calledById" INTEGER,
    "notifiedClinicianId" INTEGER,
    "notifiedClinicianName" VARCHAR(150),
    "notificationMethod" VARCHAR(32),
    "readBackConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "readBackValue" VARCHAR(80),
    "readBackAt" TIMESTAMP(3),
    "notes" VARCHAR(500),

    CONSTRAINT "LabCriticalNotification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LabCriticalNotification_flag_chk" CHECK ("flag" IN ('LL', 'HH', 'CRITICAL')),
    CONSTRAINT "LabCriticalNotification_status_chk" CHECK ("status" IN ('PENDING', 'ACKNOWLEDGED_READBACK', 'ESCALATED')),
    CONSTRAINT "LabCriticalNotification_method_chk" CHECK ("notificationMethod" IS NULL OR "notificationMethod" IN ('PHONE', 'IN_PERSON', 'SYSTEM_ALERT')),
    CONSTRAINT "LabCriticalNotification_readback_chk" CHECK (
        "status" <> 'ACKNOWLEDGED_READBACK'
        OR ("readBackConfirmed" = true AND "readBackAt" IS NOT NULL AND "calledById" IS NOT NULL)
    )
);

CREATE INDEX "LabCriticalNotification_hospitalId_status_slaDeadline_idx"
    ON "LabCriticalNotification"("hospitalId", "status", "slaDeadline");
CREATE INDEX "LabCriticalNotification_labOrderId_idx"
    ON "LabCriticalNotification"("labOrderId");

ALTER TABLE "LabCriticalNotification"
    ADD CONSTRAINT "LabCriticalNotification_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabCriticalNotification_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabCriticalNotification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabCriticalNotification_calledById_fkey" FOREIGN KEY ("calledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabCriticalNotification_notifiedClinicianId_fkey" FOREIGN KEY ("notifiedClinicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_lab_critical_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'LabCriticalNotification records are JCI safety records and cannot be deleted (id=%)', OLD.id;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."status" = 'ACKNOWLEDGED_READBACK' THEN
        RAISE EXCEPTION 'Acknowledged LabCriticalNotification read-back record is immutable (id=%)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lab_critical_notification_guard
BEFORE UPDATE OR DELETE ON "LabCriticalNotification"
FOR EACH ROW EXECUTE FUNCTION guard_lab_critical_notification();

-- 5. Append-Only Lab Result Amendments
CREATE TABLE "LabResultAmendment" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "labOrderId" INTEGER NOT NULL,
    "previousResultValue" TEXT,
    "newResultValue" TEXT,
    "previousParametersSnapshot" JSONB,
    "newParametersSnapshot" JSONB,
    "reason" VARCHAR(500) NOT NULL,
    "amendedById" INTEGER NOT NULL,
    "amendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousHash" VARCHAR(64),
    "newHash" VARCHAR(64) NOT NULL,

    CONSTRAINT "LabResultAmendment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LabResultAmendment_reason_chk" CHECK (btrim("reason") <> '')
);

CREATE INDEX "LabResultAmendment_labOrderId_amendedAt_idx" ON "LabResultAmendment"("labOrderId", "amendedAt");
CREATE INDEX "LabResultAmendment_hospitalId_amendedAt_idx" ON "LabResultAmendment"("hospitalId", "amendedAt");

ALTER TABLE "LabResultAmendment"
    ADD CONSTRAINT "LabResultAmendment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabResultAmendment_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabResultAmendment_amendedById_fkey" FOREIGN KEY ("amendedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_lab_result_amendment_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'LabResultAmendment records are append-only regulatory logs and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lab_result_amendment_immutable_guard
BEFORE UPDATE OR DELETE ON "LabResultAmendment"
FOR EACH ROW EXECUTE FUNCTION guard_lab_result_amendment_immutable();
