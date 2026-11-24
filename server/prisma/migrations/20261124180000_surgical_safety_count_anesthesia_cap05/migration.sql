-- Migration #75: CAP05 Surgical Safety Checklist (WHO), Dual-Nurse Surgical Count, Signed Anesthesia Record & Delivery Safety

-- 1. Extend DeliveryAdmission with PPH alert and signed delivery governance
ALTER TABLE "DeliveryAdmission"
  ADD COLUMN "pphAlertTriggered" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deliverySignedById" INTEGER,
  ADD COLUMN "deliverySignedAt" TIMESTAMP(3),
  ADD COLUMN "deliverySignatureHash" VARCHAR(64);

ALTER TABLE "DeliveryAdmission"
  ADD CONSTRAINT "DeliveryAdmission_signed_integrity_chk"
    CHECK (
      "deliverySignedAt" IS NULL
      OR (
        "deliverySignedById" IS NOT NULL
        AND "deliverySignatureHash" IS NOT NULL
        AND "deliverySignatureHash" ~ '^[0-9a-f]{64}$'
      )
    );

ALTER TABLE "DeliveryAdmission"
  ADD CONSTRAINT "DeliveryAdmission_deliverySignedById_fkey"
    FOREIGN KEY ("deliverySignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. WHO 3-Phase Surgical Safety Checklist (append-only, 4-eyes for TIME_OUT & SIGN_OUT)
CREATE TABLE "SurgicalSafetyChecklist" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "surgeryCaseId" INTEGER NOT NULL,
  "phase" VARCHAR(24) NOT NULL,
  "checklistItems" JSONB NOT NULL,
  "siteMarked" BOOLEAN NOT NULL DEFAULT false,
  "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "allergyChecked" BOOLEAN NOT NULL DEFAULT false,
  "antibioticProphylaxisGiven" BOOLEAN NOT NULL DEFAULT false,
  "imagingDisplayed" BOOLEAN NOT NULL DEFAULT false,
  "performedById" INTEGER NOT NULL,
  "verifiedById" INTEGER,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signatureHash" VARCHAR(64) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SurgicalSafetyChecklist_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SurgicalSafetyChecklist_phase_chk" CHECK ("phase" IN ('SIGN_IN', 'TIME_OUT', 'SIGN_OUT')),
  CONSTRAINT "SurgicalSafetyChecklist_hash_chk" CHECK ("signatureHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "SurgicalSafetyChecklist_four_eyes_chk" CHECK (
    "phase" = 'SIGN_IN'
    OR ("verifiedById" IS NOT NULL AND "verifiedById" <> "performedById")
  )
);

CREATE UNIQUE INDEX "SurgicalSafetyChecklist_surgeryCaseId_phase_key"
  ON "SurgicalSafetyChecklist"("surgeryCaseId", "phase");
CREATE INDEX "SurgicalSafetyChecklist_hospitalId_surgeryCaseId_idx"
  ON "SurgicalSafetyChecklist"("hospitalId", "surgeryCaseId");

ALTER TABLE "SurgicalSafetyChecklist"
  ADD CONSTRAINT "SurgicalSafetyChecklist_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SurgicalSafetyChecklist_surgeryCaseId_fkey"
    FOREIGN KEY ("surgeryCaseId") REFERENCES "SurgeryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SurgicalSafetyChecklist_performedById_fkey"
    FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SurgicalSafetyChecklist_verifiedById_fkey"
    FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_surgical_safety_checklist_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SurgicalSafetyChecklist records are append-only and immutable' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER surgical_safety_checklist_immutable_guard
  BEFORE UPDATE OR DELETE ON "SurgicalSafetyChecklist"
  FOR EACH ROW
  EXECUTE FUNCTION guard_surgical_safety_checklist_immutable();

-- 3. Dual-Nurse Surgical Count (Sponges, Sharps, Needles, Instruments)
CREATE TABLE "SurgicalCountItem" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "surgeryCaseId" INTEGER NOT NULL,
  "category" VARCHAR(24) NOT NULL,
  "itemName" VARCHAR(160) NOT NULL,
  "initialCount" INTEGER NOT NULL,
  "addedCount" INTEGER NOT NULL DEFAULT 0,
  "finalCount" INTEGER,
  "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  "scrubNurseId" INTEGER NOT NULL,
  "circulatingNurseId" INTEGER,
  "verifiedAt" TIMESTAMP(3),
  "resolutionNotes" TEXT,
  "incidentId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SurgicalCountItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SurgicalCountItem_category_chk" CHECK ("category" IN ('SPONGE', 'SHARP', 'INSTRUMENT', 'NEEDLE', 'OTHER')),
  CONSTRAINT "SurgicalCountItem_counts_chk" CHECK ("initialCount" >= 0 AND "addedCount" >= 0 AND ("finalCount" IS NULL OR "finalCount" >= 0)),
  CONSTRAINT "SurgicalCountItem_status_chk" CHECK ("status" IN ('OPEN', 'MATCHED', 'DISCREPANCY', 'RESOLVED_WITH_XRAY', 'ESCALATED_INCIDENT')),
  CONSTRAINT "SurgicalCountItem_matched_chk" CHECK (
    "status" <> 'MATCHED'
    OR (
      "finalCount" IS NOT NULL
      AND "finalCount" = ("initialCount" + "addedCount")
      AND "circulatingNurseId" IS NOT NULL
      AND "circulatingNurseId" <> "scrubNurseId"
      AND "verifiedAt" IS NOT NULL
    )
  ),
  CONSTRAINT "SurgicalCountItem_resolved_chk" CHECK (
    "status" NOT IN ('RESOLVED_WITH_XRAY', 'ESCALATED_INCIDENT')
    OR (
      "resolutionNotes" IS NOT NULL
      AND length(trim("resolutionNotes")) >= 5
      AND "circulatingNurseId" IS NOT NULL
      AND "circulatingNurseId" <> "scrubNurseId"
      AND "verifiedAt" IS NOT NULL
    )
  )
);

CREATE INDEX "SurgicalCountItem_hospitalId_surgeryCaseId_status_idx"
  ON "SurgicalCountItem"("hospitalId", "surgeryCaseId", "status");

ALTER TABLE "SurgicalCountItem"
  ADD CONSTRAINT "SurgicalCountItem_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SurgicalCountItem_surgeryCaseId_fkey"
    FOREIGN KEY ("surgeryCaseId") REFERENCES "SurgeryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SurgicalCountItem_scrubNurseId_fkey"
    FOREIGN KEY ("scrubNurseId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SurgicalCountItem_circulatingNurseId_fkey"
    FOREIGN KEY ("circulatingNurseId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SurgicalCountItem_incidentId_fkey"
    FOREIGN KEY ("incidentId") REFERENCES "ClinicalIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_surgical_count_item()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SurgicalCountItem audit records cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."hospitalId" IS DISTINCT FROM NEW."hospitalId"
     OR OLD."surgeryCaseId" IS DISTINCT FROM NEW."surgeryCaseId" THEN
    RAISE EXCEPTION 'SurgicalCountItem scope is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."status" IN ('MATCHED', 'RESOLVED_WITH_XRAY', 'ESCALATED_INCIDENT') THEN
    RAISE EXCEPTION 'Finalized SurgicalCountItem record is immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER surgical_count_item_guard
  BEFORE UPDATE OR DELETE ON "SurgicalCountItem"
  FOR EACH ROW
  EXECUTE FUNCTION guard_surgical_count_item();

-- 4. Signed Intra-Op Anesthesia Record (ASA standard)
CREATE TABLE "AnesthesiaRecord" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "surgeryCaseId" INTEGER NOT NULL,
  "anesthesiologistId" INTEGER NOT NULL,
  "asaClass" VARCHAR(16) NOT NULL,
  "isEmergency" BOOLEAN NOT NULL DEFAULT false,
  "anesthesiaType" VARCHAR(32) NOT NULL,
  "airwayManagement" VARCHAR(120),
  "inductionTime" TIMESTAMP(3),
  "emergenceTime" TIMESTAMP(3),
  "agentsUsed" JSONB,
  "vitalsTimeline" JSONB,
  "fluidsInMl" INTEGER NOT NULL DEFAULT 0,
  "estimatedBloodLossMl" INTEGER NOT NULL DEFAULT 0,
  "urineOutputMl" INTEGER NOT NULL DEFAULT 0,
  "pacuAldreteScore" INTEGER,
  "complications" TEXT,
  "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  "signedById" INTEGER,
  "signedAt" TIMESTAMP(3),
  "signatureHash" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnesthesiaRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnesthesiaRecord_asa_chk" CHECK ("asaClass" IN ('ASA_1', 'ASA_2', 'ASA_3', 'ASA_4', 'ASA_5', 'ASA_6')),
  CONSTRAINT "AnesthesiaRecord_type_chk" CHECK ("anesthesiaType" IN ('GENERAL', 'SPINAL', 'EPIDURAL', 'COMBINED_SPINAL_EPIDURAL', 'REGIONAL_BLOCK', 'MAC_SEDATION', 'LOCAL')),
  CONSTRAINT "AnesthesiaRecord_volumes_chk" CHECK ("fluidsInMl" >= 0 AND "estimatedBloodLossMl" >= 0 AND "urineOutputMl" >= 0),
  CONSTRAINT "AnesthesiaRecord_aldrete_chk" CHECK ("pacuAldreteScore" IS NULL OR ("pacuAldreteScore" >= 0 AND "pacuAldreteScore" <= 10)),
  CONSTRAINT "AnesthesiaRecord_status_chk" CHECK ("status" IN ('DRAFT', 'SIGNED')),
  CONSTRAINT "AnesthesiaRecord_signed_integrity_chk" CHECK (
    "status" <> 'SIGNED'
    OR (
      "signedById" IS NOT NULL
      AND "signedAt" IS NOT NULL
      AND "signatureHash" IS NOT NULL
      AND "signatureHash" ~ '^[0-9a-f]{64}$'
    )
  )
);

CREATE UNIQUE INDEX "AnesthesiaRecord_surgeryCaseId_key" ON "AnesthesiaRecord"("surgeryCaseId");
CREATE INDEX "AnesthesiaRecord_hospitalId_status_idx" ON "AnesthesiaRecord"("hospitalId", "status");

ALTER TABLE "AnesthesiaRecord"
  ADD CONSTRAINT "AnesthesiaRecord_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AnesthesiaRecord_surgeryCaseId_fkey"
    FOREIGN KEY ("surgeryCaseId") REFERENCES "SurgeryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AnesthesiaRecord_anesthesiologistId_fkey"
    FOREIGN KEY ("anesthesiologistId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AnesthesiaRecord_signedById_fkey"
    FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_anesthesia_record()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AnesthesiaRecord audit records cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."status" = 'SIGNED' THEN
    RAISE EXCEPTION 'Signed AnesthesiaRecord is immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER anesthesia_record_guard
  BEFORE UPDATE OR DELETE ON "AnesthesiaRecord"
  FOR EACH ROW
  EXECUTE FUNCTION guard_anesthesia_record();
