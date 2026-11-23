-- CAP06: Patient Merge / Unmerge (4-Eyes Reversible Governance) & Patient Death Management
BEGIN;

ALTER TABLE "Patient"
    ADD COLUMN "isDeceased" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "dateOfDeath" TIMESTAMP(3),
    ADD COLUMN "deathCertificateNumber" VARCHAR(100),
    ADD COLUMN "causeOfDeath" VARCHAR(500),
    ADD COLUMN "deathLocation" VARCHAR(200),
    ADD COLUMN "deathRecordedById" INTEGER,
    ADD COLUMN "deathRecordedAt" TIMESTAMP(3),
    ADD COLUMN "mergedIntoPatientId" INTEGER,
    ADD COLUMN "mergedAt" TIMESTAMP(3),
    ADD COLUMN "mergedById" INTEGER;

CREATE INDEX "Patient_hospitalId_isDeceased_idx" ON "Patient"("hospitalId", "isDeceased");
CREATE INDEX "Patient_mergedIntoPatientId_idx" ON "Patient"("mergedIntoPatientId");

ALTER TABLE "Patient"
    ADD CONSTRAINT "Patient_deathRecordedById_fkey"
        FOREIGN KEY ("deathRecordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "Patient_mergedIntoPatientId_fkey"
        FOREIGN KEY ("mergedIntoPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "Patient_mergedById_fkey"
        FOREIGN KEY ("mergedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "Patient_death_fields_chk" CHECK (
        ("isDeceased" = false AND "dateOfDeath" IS NULL AND "deathRecordedAt" IS NULL AND "deathRecordedById" IS NULL)
        OR ("isDeceased" = true AND "dateOfDeath" IS NOT NULL AND "deathRecordedAt" IS NOT NULL AND "deathRecordedById" IS NOT NULL)
    ),
    ADD CONSTRAINT "Patient_merge_self_chk" CHECK (
        "mergedIntoPatientId" IS NULL OR "mergedIntoPatientId" <> "id"
    ),
    ADD CONSTRAINT "Patient_merge_fields_chk" CHECK (
        ("mergedIntoPatientId" IS NULL AND "mergedAt" IS NULL AND "mergedById" IS NULL)
        OR ("mergedIntoPatientId" IS NOT NULL AND "mergedAt" IS NOT NULL AND "mergedById" IS NOT NULL)
    );

CREATE TABLE "PatientMergeRecord" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "sourcePatientId" INTEGER NOT NULL,
    "targetPatientId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(500) NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" VARCHAR(500),
    "unmergedById" INTEGER,
    "unmergedAt" TIMESTAMP(3),
    "unmergeReason" VARCHAR(500),
    "transferManifest" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientMergeRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientMergeRecord_distinct_patients_chk" CHECK ("sourcePatientId" <> "targetPatientId"),
    CONSTRAINT "PatientMergeRecord_status_chk" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'UNMERGED')),
    CONSTRAINT "PatientMergeRecord_4eyes_chk" CHECK ("reviewedById" IS NULL OR "reviewedById" <> "requestedById")
);

CREATE INDEX "PatientMergeRecord_hospitalId_status_createdAt_idx" ON "PatientMergeRecord"("hospitalId", "status", "createdAt");
CREATE INDEX "PatientMergeRecord_sourcePatientId_idx" ON "PatientMergeRecord"("sourcePatientId");
CREATE INDEX "PatientMergeRecord_targetPatientId_idx" ON "PatientMergeRecord"("targetPatientId");
CREATE UNIQUE INDEX "PatientMergeRecord_pending_source_unique"
    ON "PatientMergeRecord"("hospitalId", "sourcePatientId")
    WHERE "status" = 'PENDING';

ALTER TABLE "PatientMergeRecord"
    ADD CONSTRAINT "PatientMergeRecord_hospitalId_fkey"
        FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientMergeRecord_sourcePatientId_fkey"
        FOREIGN KEY ("sourcePatientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientMergeRecord_targetPatientId_fkey"
        FOREIGN KEY ("targetPatientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientMergeRecord_requestedById_fkey"
        FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientMergeRecord_reviewedById_fkey"
        FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientMergeRecord_unmergedById_fkey"
        FOREIGN KEY ("unmergedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PatientDeathEvent" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "dateOfDeath" TIMESTAMP(3),
    "deathCertificateNumber" VARCHAR(100),
    "causeOfDeath" VARCHAR(500),
    "deathLocation" VARCHAR(200),
    "encounterId" INTEGER,
    "cancelledAppointmentIds" JSONB,
    "reason" VARCHAR(500),
    "actorId" INTEGER NOT NULL,
    "relatedEventId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientDeathEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientDeathEvent_type_chk" CHECK (
        "eventType" IN ('RECORDED', 'REVERSAL_REQUESTED', 'REVERSAL_APPROVED', 'REVERSAL_REJECTED')
    )
);

CREATE INDEX "PatientDeathEvent_hospitalId_patientId_createdAt_idx" ON "PatientDeathEvent"("hospitalId", "patientId", "createdAt");

ALTER TABLE "PatientDeathEvent"
    ADD CONSTRAINT "PatientDeathEvent_hospitalId_fkey"
        FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientDeathEvent_patientId_fkey"
        FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PatientDeathEvent_actorId_fkey"
        FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_patient_merge_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Patient merge governance records are immutable and cannot be deleted'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "Patient" p
        WHERE p."id" = NEW."sourcePatientId" AND p."hospitalId" = NEW."hospitalId"
    ) OR NOT EXISTS (
        SELECT 1 FROM "Patient" p
        WHERE p."id" = NEW."targetPatientId" AND p."hospitalId" = NEW."hospitalId"
    ) THEN
        RAISE EXCEPTION 'Source and target patients must belong to the same hospital'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD."status" IN ('REJECTED', 'UNMERGED') THEN
            RAISE EXCEPTION 'Finalized patient merge record cannot be modified'
                USING ERRCODE = '23514';
        END IF;
        IF OLD."status" = 'APPROVED' AND NEW."status" <> 'UNMERGED' THEN
            RAISE EXCEPTION 'Approved patient merge can only transition to UNMERGED'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER patient_merge_record_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "PatientMergeRecord"
    FOR EACH ROW EXECUTE FUNCTION guard_patient_merge_record();

CREATE OR REPLACE FUNCTION guard_patient_death_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Patient death event ledger is append-only and immutable'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "Patient" p
        WHERE p."id" = NEW."patientId" AND p."hospitalId" = NEW."hospitalId"
    ) THEN
        RAISE EXCEPTION 'Patient death event must belong to the patient hospital'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER patient_death_event_immutable_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "PatientDeathEvent"
    FOR EACH ROW EXECUTE FUNCTION guard_patient_death_event();

COMMIT;
