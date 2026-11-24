-- Migration #74: Radiology Clinical Modernization P0/P1 (CAP13 / CAP07 / JCI IPSG.2)
-- 1. Drop accidental global unique index on RadiologyStudy.code (preserve per-hospital @@unique([hospitalId, code]))
DROP INDEX IF EXISTS "RadiologyStudy_code_key";

-- 2. Extend RadiologyStudy with contrast & radiation safety metadata
ALTER TABLE "RadiologyStudy"
  ADD COLUMN "requiresContrast" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contrastType" VARCHAR(32),
  ADD COLUMN "ionizingRadiation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "minEgfrThreshold" DECIMAL(6,2);

ALTER TABLE "RadiologyStudy"
  ADD CONSTRAINT "RadiologyStudy_contrast_type_chk"
    CHECK ("contrastType" IS NULL OR "contrastType" IN ('IODINATED', 'GADOLINIUM', 'ORAL', 'OTHER')),
  ADD CONSTRAINT "RadiologyStudy_min_egfr_chk"
    CHECK ("minEgfrThreshold" IS NULL OR "minEgfrThreshold" >= 0);

-- 3. Create multi-tenant multi-modality DICOM MWL Station registry
CREATE TABLE "RadiologyStation" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "stationAet" VARCHAR(16) NOT NULL,
  "stationName" VARCHAR(120) NOT NULL,
  "modality" VARCHAR(16) NOT NULL,
  "roomLocation" VARCHAR(120),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RadiologyStation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RadiologyStation_aet_chk" CHECK ("stationAet" ~ '^[A-Z0-9_-]{1,16}$'),
  CONSTRAINT "RadiologyStation_modality_chk" CHECK ("modality" IN ('DX', 'CR', 'CT', 'MR', 'US', 'MG', 'RF', 'XA', 'NM', 'PT', 'DXA', 'OT'))
);

CREATE UNIQUE INDEX "RadiologyStation_hospitalId_stationAet_key" ON "RadiologyStation"("hospitalId", "stationAet");
CREATE INDEX "RadiologyStation_hospitalId_modality_isActive_idx" ON "RadiologyStation"("hospitalId", "modality", "isActive");

ALTER TABLE "RadiologyStation"
  ADD CONSTRAINT "RadiologyStation_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Extend RadiologyOrder with structured reporting, SHA-256 signature lock, safety screening & station binding
ALTER TABLE "RadiologyOrder"
  ADD COLUMN "reportStatus" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "indicationText" TEXT,
  ADD COLUMN "techniqueText" TEXT,
  ADD COLUMN "findingsText" TEXT,
  ADD COLUMN "impressionText" TEXT,
  ADD COLUMN "biradsScore" VARCHAR(32),
  ADD COLUMN "isCriticalFinding" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reportedById" INTEGER,
  ADD COLUMN "signedById" INTEGER,
  ADD COLUMN "signedAt" TIMESTAMP(3),
  ADD COLUMN "signatureHash" VARCHAR(64),
  ADD COLUMN "contrastSafetyChecked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contrastSafetyNotes" TEXT,
  ADD COLUMN "pregnancyChecked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pregnancyStatus" VARCHAR(24),
  ADD COLUMN "egfrAtOrder" DECIMAL(6,2),
  ADD COLUMN "stationId" INTEGER;

ALTER TABLE "RadiologyOrder"
  ADD CONSTRAINT "RadiologyOrder_report_status_chk"
    CHECK ("reportStatus" IN ('DRAFT', 'PRELIMINARY', 'FINAL', 'AMENDED')),
  ADD CONSTRAINT "RadiologyOrder_pregnancy_status_chk"
    CHECK ("pregnancyStatus" IS NULL OR "pregnancyStatus" IN ('NOT_PREGNANT', 'PREGNANT', 'UNKNOWN', 'NOT_APPLICABLE')),
  ADD CONSTRAINT "RadiologyOrder_signed_integrity_chk"
    CHECK (
      "reportStatus" NOT IN ('FINAL', 'AMENDED')
      OR (
        "signedById" IS NOT NULL
        AND "signedAt" IS NOT NULL
        AND "signatureHash" IS NOT NULL
        AND "signatureHash" ~ '^[0-9a-f]{64}$'
      )
    );

CREATE INDEX "RadiologyOrder_reportStatus_idx" ON "RadiologyOrder"("reportStatus");
CREATE INDEX "RadiologyOrder_stationId_idx" ON "RadiologyOrder"("stationId");

ALTER TABLE "RadiologyOrder"
  ADD CONSTRAINT "RadiologyOrder_reportedById_fkey"
    FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "RadiologyOrder_signedById_fkey"
    FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "RadiologyOrder_stationId_fkey"
    FOREIGN KEY ("stationId") REFERENCES "RadiologyStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PostgreSQL immutability trigger for electronically signed radiology reports
CREATE OR REPLACE FUNCTION guard_radiology_order_signed_report()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."reportStatus" IN ('FINAL', 'AMENDED') THEN
    IF NEW."reportStatus" NOT IN ('FINAL', 'AMENDED') THEN
      RAISE EXCEPTION 'Signed radiology report cannot revert to DRAFT or PRELIMINARY' USING ERRCODE = 'P0001';
    END IF;
    IF NEW."signedById" IS DISTINCT FROM OLD."signedById"
       OR NEW."signedAt" IS DISTINCT FROM OLD."signedAt" THEN
      RAISE EXCEPTION 'Original radiologist signature metadata is immutable' USING ERRCODE = 'P0001';
    END IF;
    IF (
      NEW."reportText" IS DISTINCT FROM OLD."reportText"
      OR NEW."indicationText" IS DISTINCT FROM OLD."indicationText"
      OR NEW."techniqueText" IS DISTINCT FROM OLD."techniqueText"
      OR NEW."findingsText" IS DISTINCT FROM OLD."findingsText"
      OR NEW."impressionText" IS DISTINCT FROM OLD."impressionText"
      OR NEW."biradsScore" IS DISTINCT FROM OLD."biradsScore"
    ) THEN
      RAISE EXCEPTION 'Signed radiology report text is immutable; append a RadiologyReportAddendum instead' USING ERRCODE = 'P0001';
    END IF;
    IF NEW."signatureHash" IS DISTINCT FROM OLD."signatureHash" AND NEW."reportStatus" <> 'AMENDED' THEN
      RAISE EXCEPTION 'Radiology signature hash may only advance via signed addendum (AMENDED)' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER radiology_order_signed_report_guard
  BEFORE UPDATE ON "RadiologyOrder"
  FOR EACH ROW
  EXECUTE FUNCTION guard_radiology_order_signed_report();

-- 5. Append-only signed RadiologyReportAddendum table
CREATE TABLE "RadiologyReportAddendum" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "radiologyOrderId" INTEGER NOT NULL,
  "addendumNumber" INTEGER NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "addendumText" TEXT NOT NULL,
  "isCriticalFinding" BOOLEAN NOT NULL DEFAULT false,
  "authorId" INTEGER NOT NULL,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "previousReportHash" VARCHAR(64) NOT NULL,
  "addendumHash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RadiologyReportAddendum_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RadiologyReportAddendum_number_chk" CHECK ("addendumNumber" >= 1),
  CONSTRAINT "RadiologyReportAddendum_reason_chk" CHECK (length(trim("reason")) >= 3),
  CONSTRAINT "RadiologyReportAddendum_text_chk" CHECK (length(trim("addendumText")) >= 3),
  CONSTRAINT "RadiologyReportAddendum_hash_chk" CHECK ("previousReportHash" ~ '^[0-9a-f]{64}$' AND "addendumHash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "RadiologyReportAddendum_radiologyOrderId_addendumNumber_key"
  ON "RadiologyReportAddendum"("radiologyOrderId", "addendumNumber");
CREATE INDEX "RadiologyReportAddendum_hospitalId_radiologyOrderId_idx"
  ON "RadiologyReportAddendum"("hospitalId", "radiologyOrderId");

ALTER TABLE "RadiologyReportAddendum"
  ADD CONSTRAINT "RadiologyReportAddendum_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RadiologyReportAddendum_radiologyOrderId_fkey"
    FOREIGN KEY ("radiologyOrderId") REFERENCES "RadiologyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RadiologyReportAddendum_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_radiology_report_addendum_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'RadiologyReportAddendum records are append-only and cannot be modified or deleted' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER radiology_report_addendum_immutable_guard
  BEFORE UPDATE OR DELETE ON "RadiologyReportAddendum"
  FOR EACH ROW
  EXECUTE FUNCTION guard_radiology_report_addendum_immutable();

-- 6. JCI IPSG.2 Radiology Critical Finding Read-Back Notification Log
CREATE TABLE "RadiologyCriticalNotification" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "radiologyOrderId" INTEGER NOT NULL,
  "findingSummary" VARCHAR(500) NOT NULL,
  "severity" VARCHAR(24) NOT NULL DEFAULT 'CRITICAL',
  "notifiedById" INTEGER NOT NULL,
  "notifiedToName" VARCHAR(160),
  "notifiedToUserId" INTEGER,
  "communicationChannel" VARCHAR(32),
  "readBackConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "readBackNotes" TEXT,
  "notifiedAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "slaDeadlineAt" TIMESTAMP(3) NOT NULL,
  "slaBreached" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RadiologyCriticalNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RadiologyCriticalNotification_severity_chk" CHECK ("severity" IN ('CRITICAL', 'URGENT')),
  CONSTRAINT "RadiologyCriticalNotification_channel_chk" CHECK ("communicationChannel" IS NULL OR "communicationChannel" IN ('PHONE', 'IN_PERSON', 'DIRECT_MESSAGE', 'PAGER')),
  CONSTRAINT "RadiologyCriticalNotification_ack_chk" CHECK (
    "readBackConfirmed" = false
    OR (
      "acknowledgedAt" IS NOT NULL
      AND "notifiedToName" IS NOT NULL
      AND length(trim("notifiedToName")) >= 2
      AND "communicationChannel" IS NOT NULL
    )
  )
);

CREATE INDEX "RadiologyCriticalNotification_hospitalId_readBackConfirmed__idx"
  ON "RadiologyCriticalNotification"("hospitalId", "readBackConfirmed", "slaDeadlineAt");
CREATE INDEX "RadiologyCriticalNotification_radiologyOrderId_idx"
  ON "RadiologyCriticalNotification"("radiologyOrderId");

ALTER TABLE "RadiologyCriticalNotification"
  ADD CONSTRAINT "RadiologyCriticalNotification_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RadiologyCriticalNotification_radiologyOrderId_fkey"
    FOREIGN KEY ("radiologyOrderId") REFERENCES "RadiologyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RadiologyCriticalNotification_notifiedById_fkey"
    FOREIGN KEY ("notifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RadiologyCriticalNotification_notifiedToUserId_fkey"
    FOREIGN KEY ("notifiedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_radiology_critical_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RadiologyCriticalNotification audit records cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."hospitalId" IS DISTINCT FROM NEW."hospitalId"
     OR OLD."radiologyOrderId" IS DISTINCT FROM NEW."radiologyOrderId" THEN
    RAISE EXCEPTION 'RadiologyCriticalNotification scope is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."readBackConfirmed" = true THEN
    RAISE EXCEPTION 'Acknowledged RadiologyCriticalNotification cannot be modified' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER radiology_critical_notification_guard
  BEFORE UPDATE OR DELETE ON "RadiologyCriticalNotification"
  FOR EACH ROW
  EXECUTE FUNCTION guard_radiology_critical_notification();

-- 7. Structured Radiology Report Templates
CREATE TABLE "RadiologyReportTemplate" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "modality" VARCHAR(16),
  "bodyPart" VARCHAR(64),
  "indicationTemplate" TEXT,
  "techniqueTemplate" TEXT,
  "findingsTemplate" TEXT,
  "impressionTemplate" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RadiologyReportTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RadiologyReportTemplate_hospitalId_code_key" ON "RadiologyReportTemplate"("hospitalId", "code");
CREATE INDEX "RadiologyReportTemplate_hospitalId_modality_isActive_idx" ON "RadiologyReportTemplate"("hospitalId", "modality", "isActive");

ALTER TABLE "RadiologyReportTemplate"
  ADD CONSTRAINT "RadiologyReportTemplate_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RadiologyReportTemplate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
