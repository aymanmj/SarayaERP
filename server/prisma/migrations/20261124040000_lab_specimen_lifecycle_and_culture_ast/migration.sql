-- CAP02: Laboratory Specimen Lifecycle (Barcode Chain-of-Custody, Rejection/Recollection) & Microbiology Culture/AST
BEGIN;

CREATE TABLE "LabSpecimen" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "labOrderId" INTEGER NOT NULL,
    "barcode" VARCHAR(64) NOT NULL,
    "specimenType" VARCHAR(64) NOT NULL,
    "containerType" VARCHAR(64),
    "collectionSite" VARCHAR(120),
    "status" TEXT NOT NULL DEFAULT 'COLLECTED',
    "collectedById" INTEGER NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" INTEGER,
    "receivedAt" TIMESTAMP(3),
    "rejectedById" INTEGER,
    "rejectedAt" TIMESTAMP(3),
    "rejectionCode" VARCHAR(64),
    "rejectionReason" VARCHAR(500),
    "recollectionOfId" INTEGER,
    "storageLocation" VARCHAR(120),
    "disposedById" INTEGER,
    "disposedAt" TIMESTAMP(3),
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabSpecimen_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LabSpecimen_status_chk" CHECK (
        "status" IN (
            'COLLECTED',
            'IN_TRANSIT',
            'RECEIVED',
            'IN_PROCESS',
            'REJECTED',
            'RECOLLECT_REQUESTED',
            'STORED',
            'DISPOSED'
        )
    ),
    CONSTRAINT "LabSpecimen_rejection_chk" CHECK (
        "status" NOT IN ('REJECTED', 'RECOLLECT_REQUESTED')
        OR ("rejectedAt" IS NOT NULL AND "rejectedById" IS NOT NULL AND "rejectionCode" IS NOT NULL)
    ),
    CONSTRAINT "LabSpecimen_recollection_self_chk" CHECK (
        "recollectionOfId" IS NULL OR "recollectionOfId" <> "id"
    )
);

CREATE UNIQUE INDEX "LabSpecimen_hospitalId_barcode_key" ON "LabSpecimen"("hospitalId", "barcode");
CREATE INDEX "LabSpecimen_hospitalId_labOrderId_idx" ON "LabSpecimen"("hospitalId", "labOrderId");
CREATE INDEX "LabSpecimen_hospitalId_status_idx" ON "LabSpecimen"("hospitalId", "status");
CREATE INDEX "LabSpecimen_recollectionOfId_idx" ON "LabSpecimen"("recollectionOfId");

ALTER TABLE "LabSpecimen"
    ADD CONSTRAINT "LabSpecimen_hospitalId_fkey"
        FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabSpecimen_labOrderId_fkey"
        FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabSpecimen_collectedById_fkey"
        FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabSpecimen_receivedById_fkey"
        FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "LabSpecimen_rejectedById_fkey"
        FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "LabSpecimen_disposedById_fkey"
        FOREIGN KEY ("disposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "LabSpecimen_recollectionOfId_fkey"
        FOREIGN KEY ("recollectionOfId") REFERENCES "LabSpecimen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LabSpecimenEvent" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "specimenId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" INTEGER NOT NULL,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabSpecimenEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LabSpecimenEvent_hospitalId_specimenId_createdAt_idx"
    ON "LabSpecimenEvent"("hospitalId", "specimenId", "createdAt");

ALTER TABLE "LabSpecimenEvent"
    ADD CONSTRAINT "LabSpecimenEvent_hospitalId_fkey"
        FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabSpecimenEvent_specimenId_fkey"
        FOREIGN KEY ("specimenId") REFERENCES "LabSpecimen"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabSpecimenEvent_actorId_fkey"
        FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LabCultureReport" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "labOrderId" INTEGER NOT NULL,
    "specimenId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PRELIMINARY',
    "gramStain" VARCHAR(500),
    "growthStatus" TEXT NOT NULL,
    "organismName" VARCHAR(200),
    "organismCode" VARCHAR(64),
    "colonyCount" VARCHAR(100),
    "incubationHours" INTEGER,
    "comments" TEXT,
    "enteredById" INTEGER NOT NULL,
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "verificationHash" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabCultureReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LabCultureReport_status_chk" CHECK (
        "status" IN ('PRELIMINARY', 'INTERIM', 'FINAL_VERIFIED', 'AMENDED')
    ),
    CONSTRAINT "LabCultureReport_growth_chk" CHECK (
        "growthStatus" IN ('NO_GROWTH', 'MIXED_FLORA', 'SIGNIFICANT_GROWTH', 'CONTAMINATED')
    ),
    CONSTRAINT "LabCultureReport_verify_chk" CHECK (
        "status" <> 'FINAL_VERIFIED'
        OR (
            "verifiedById" IS NOT NULL
            AND "verifiedAt" IS NOT NULL
            AND "verificationHash" ~ '^[0-9a-f]{64}$'
        )
    )
);

CREATE INDEX "LabCultureReport_hospitalId_labOrderId_idx" ON "LabCultureReport"("hospitalId", "labOrderId");
CREATE INDEX "LabCultureReport_specimenId_idx" ON "LabCultureReport"("specimenId");

ALTER TABLE "LabCultureReport"
    ADD CONSTRAINT "LabCultureReport_hospitalId_fkey"
        FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabCultureReport_labOrderId_fkey"
        FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabCultureReport_specimenId_fkey"
        FOREIGN KEY ("specimenId") REFERENCES "LabSpecimen"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "LabCultureReport_enteredById_fkey"
        FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LabCultureReport_verifiedById_fkey"
        FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LabCultureSensitivity" (
    "id" SERIAL NOT NULL,
    "cultureReportId" INTEGER NOT NULL,
    "antibioticName" VARCHAR(120) NOT NULL,
    "antibioticCode" VARCHAR(64),
    "interpretation" TEXT NOT NULL,
    "micValue" VARCHAR(64),
    "zoneDiameterMm" INTEGER,
    "isRestricted" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(255),

    CONSTRAINT "LabCultureSensitivity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LabCultureSensitivity_interp_chk" CHECK (
        "interpretation" IN ('S', 'I', 'R', 'SDD')
    )
);

CREATE UNIQUE INDEX "LabCultureSensitivity_cultureReportId_antibioticName_key"
    ON "LabCultureSensitivity"("cultureReportId", "antibioticName");
CREATE INDEX "LabCultureSensitivity_cultureReportId_idx"
    ON "LabCultureSensitivity"("cultureReportId");

ALTER TABLE "LabCultureSensitivity"
    ADD CONSTRAINT "LabCultureSensitivity_cultureReportId_fkey"
        FOREIGN KEY ("cultureReportId") REFERENCES "LabCultureReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_lab_specimen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Laboratory specimen chain-of-custody records cannot be deleted'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM "LabOrder" lo
          JOIN "Order" o ON o."id" = lo."orderId"
         WHERE lo."id" = NEW."labOrderId"
           AND o."hospitalId" = NEW."hospitalId"
    ) THEN
        RAISE EXCEPTION 'Lab specimen must belong to a LabOrder within the same hospital'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW."barcode" IS DISTINCT FROM OLD."barcode"
           OR NEW."labOrderId" IS DISTINCT FROM OLD."labOrderId"
           OR NEW."hospitalId" IS DISTINCT FROM OLD."hospitalId"
           OR NEW."collectedById" IS DISTINCT FROM OLD."collectedById"
           OR NEW."collectedAt" IS DISTINCT FROM OLD."collectedAt" THEN
            RAISE EXCEPTION 'Specimen identity, barcode, and collection metadata are immutable'
                USING ERRCODE = '23514';
        END IF;

        IF OLD."status" = 'DISPOSED' AND NEW."status" <> 'DISPOSED' THEN
            RAISE EXCEPTION 'Disposed specimen cannot be reactivated'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER lab_specimen_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "LabSpecimen"
    FOR EACH ROW EXECUTE FUNCTION guard_lab_specimen();

CREATE OR REPLACE FUNCTION guard_lab_specimen_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Specimen chain-of-custody events are append-only and immutable'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "LabSpecimen" s
        WHERE s."id" = NEW."specimenId" AND s."hospitalId" = NEW."hospitalId"
    ) THEN
        RAISE EXCEPTION 'Specimen event must match specimen hospital scope'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER lab_specimen_event_immutable_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "LabSpecimenEvent"
    FOR EACH ROW EXECUTE FUNCTION guard_lab_specimen_event();

CREATE OR REPLACE FUNCTION guard_lab_culture_report()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    spec_record RECORD;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Culture and sensitivity reports cannot be deleted'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM "LabOrder" lo
          JOIN "Order" o ON o."id" = lo."orderId"
         WHERE lo."id" = NEW."labOrderId"
           AND o."hospitalId" = NEW."hospitalId"
    ) THEN
        RAISE EXCEPTION 'Culture report must belong to a LabOrder within the same hospital'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."specimenId" IS NOT NULL THEN
        SELECT "hospitalId", "labOrderId", "status"
          INTO spec_record
          FROM "LabSpecimen"
         WHERE "id" = NEW."specimenId";

        IF NOT FOUND
           OR spec_record."hospitalId" <> NEW."hospitalId"
           OR spec_record."labOrderId" <> NEW."labOrderId" THEN
            RAISE EXCEPTION 'Culture report specimen must belong to the same LabOrder and hospital'
                USING ERRCODE = '23514';
        END IF;

        IF spec_record."status" IN ('REJECTED', 'RECOLLECT_REQUESTED') THEN
            RAISE EXCEPTION 'Cannot link culture report to a rejected specimen'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD."status" = 'FINAL_VERIFIED' THEN
        IF NEW."gramStain" IS DISTINCT FROM OLD."gramStain"
           OR NEW."growthStatus" IS DISTINCT FROM OLD."growthStatus"
           OR NEW."organismName" IS DISTINCT FROM OLD."organismName"
           OR NEW."organismCode" IS DISTINCT FROM OLD."organismCode"
           OR NEW."colonyCount" IS DISTINCT FROM OLD."colonyCount"
           OR NEW."verifiedById" IS DISTINCT FROM OLD."verifiedById"
           OR NEW."verifiedAt" IS DISTINCT FROM OLD."verifiedAt"
           OR NEW."verificationHash" IS DISTINCT FROM OLD."verificationHash" THEN
            RAISE EXCEPTION 'Final verified culture report is immutable and cannot be altered'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER lab_culture_report_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "LabCultureReport"
    FOR EACH ROW EXECUTE FUNCTION guard_lab_culture_report();

CREATE OR REPLACE FUNCTION guard_lab_culture_sensitivity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_report_id INTEGER;
    report_status TEXT;
BEGIN
    target_report_id := COALESCE(NEW."cultureReportId", OLD."cultureReportId");
    SELECT "status" INTO report_status
      FROM "LabCultureReport"
     WHERE "id" = target_report_id;

    IF report_status = 'FINAL_VERIFIED' THEN
        RAISE EXCEPTION 'Antibiogram sensitivities cannot be modified after culture report verification'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER lab_culture_sensitivity_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "LabCultureSensitivity"
    FOR EACH ROW EXECUTE FUNCTION guard_lab_culture_sensitivity();

COMMIT;
