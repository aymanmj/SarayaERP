-- CAP04: Blood Bank & Transfusion Safety (ABO/Rh Inventory, Crossmatch, Dual Bedside Check & Hemovigilance)
-- Migration #72

CREATE TABLE "BloodUnit" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "unitNumber" VARCHAR(64) NOT NULL,
    "componentType" VARCHAR(32) NOT NULL,
    "bloodGroup" VARCHAR(4) NOT NULL,
    "volumeMl" INTEGER NOT NULL,
    "donorReference" VARCHAR(100),
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "storageLocation" VARCHAR(100),
    "screeningStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "screeningNotes" VARCHAR(500),
    "status" TEXT NOT NULL DEFAULT 'QUARANTINED',
    "discardReason" VARCHAR(500),
    "receivedById" INTEGER NOT NULL,
    "screenedById" INTEGER,
    "screenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloodUnit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BloodUnit_unit_nonempty_chk" CHECK (btrim("unitNumber") <> ''),
    CONSTRAINT "BloodUnit_volume_pos_chk" CHECK ("volumeMl" > 0 AND "volumeMl" <= 2000),
    CONSTRAINT "BloodUnit_dates_chk" CHECK ("expiresAt" > "collectedAt"),
    CONSTRAINT "BloodUnit_component_chk" CHECK ("componentType" IN ('PRBC', 'WHOLE_BLOOD', 'FFP', 'PLATELETS', 'CRYOPRECIPITATE')),
    CONSTRAINT "BloodUnit_blood_group_chk" CHECK ("bloodGroup" IN ('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+')),
    CONSTRAINT "BloodUnit_screening_chk" CHECK ("screeningStatus" IN ('PENDING', 'CLEARED', 'REACTIVE_QUARANTINED')),
    CONSTRAINT "BloodUnit_status_chk" CHECK ("status" IN ('QUARANTINED', 'AVAILABLE', 'CROSSMATCHED', 'ISSUED', 'TRANSFUSED', 'EXPIRED', 'DISCARDED', 'REACTED_QUARANTINED')),
    CONSTRAINT "BloodUnit_cleared_before_release_chk" CHECK (
        "status" NOT IN ('AVAILABLE', 'CROSSMATCHED', 'ISSUED', 'TRANSFUSED')
        OR ("screeningStatus" = 'CLEARED' AND "screenedById" IS NOT NULL AND "screenedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "BloodUnit_hospitalId_unitNumber_key" ON "BloodUnit"("hospitalId", "unitNumber");
CREATE INDEX "BloodUnit_hospitalId_status_bloodGroup_componentType_idx" ON "BloodUnit"("hospitalId", "status", "bloodGroup", "componentType");
CREATE INDEX "BloodUnit_hospitalId_expiresAt_idx" ON "BloodUnit"("hospitalId", "expiresAt");

ALTER TABLE "BloodUnit"
    ADD CONSTRAINT "BloodUnit_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodUnit_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodUnit_screenedById_fkey" FOREIGN KEY ("screenedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_blood_unit()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'BloodUnit records are permanent hemovigilance records and cannot be deleted (id=%)', OLD.id;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD."hospitalId" <> NEW."hospitalId"
           OR OLD."unitNumber" <> NEW."unitNumber"
           OR OLD."componentType" <> NEW."componentType"
           OR OLD."bloodGroup" <> NEW."bloodGroup"
           OR OLD."collectedAt" <> NEW."collectedAt" THEN
            RAISE EXCEPTION 'BloodUnit identity fields (unitNumber, componentType, bloodGroup, collectedAt) are immutable (id=%)', OLD.id;
        END IF;

        IF OLD."status" = 'DISCARDED' THEN
            RAISE EXCEPTION 'Discarded BloodUnit cannot be reactivated or modified (id=%)', OLD.id;
        END IF;

        IF OLD."status" = 'TRANSFUSED' AND NEW."status" NOT IN ('TRANSFUSED', 'REACTED_QUARANTINED') THEN
            RAISE EXCEPTION 'Transfused BloodUnit cannot transition to status % (id=%)', NEW."status", OLD.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blood_unit_guard
BEFORE INSERT OR UPDATE OR DELETE ON "BloodUnit"
FOR EACH ROW EXECUTE FUNCTION guard_blood_unit();

CREATE TABLE "BloodCrossmatch" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "bloodUnitId" INTEGER NOT NULL,
    "patientBloodGroup" VARCHAR(4) NOT NULL,
    "antibodyScreen" TEXT NOT NULL DEFAULT 'NEGATIVE',
    "crossmatchResult" TEXT NOT NULL DEFAULT 'COMPATIBLE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "performedById" INTEGER NOT NULL,
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloodCrossmatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BloodCrossmatch_blood_group_chk" CHECK ("patientBloodGroup" IN ('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+')),
    CONSTRAINT "BloodCrossmatch_antibody_chk" CHECK ("antibodyScreen" IN ('NEGATIVE', 'POSITIVE')),
    CONSTRAINT "BloodCrossmatch_result_chk" CHECK ("crossmatchResult" IN ('COMPATIBLE', 'INCOMPATIBLE', 'EMERGENCY_UNMATCHED')),
    CONSTRAINT "BloodCrossmatch_status_chk" CHECK ("status" IN ('ACTIVE', 'ISSUED', 'EXPIRED', 'RELEASED', 'CONSUMED')),
    CONSTRAINT "BloodCrossmatch_4eyes_chk" CHECK ("verifiedById" IS NULL OR "verifiedById" <> "performedById")
);

CREATE INDEX "BloodCrossmatch_hospitalId_patientId_status_idx" ON "BloodCrossmatch"("hospitalId", "patientId", "status");
CREATE INDEX "BloodCrossmatch_hospitalId_encounterId_idx" ON "BloodCrossmatch"("hospitalId", "encounterId");
CREATE INDEX "BloodCrossmatch_bloodUnitId_status_idx" ON "BloodCrossmatch"("bloodUnitId", "status");

ALTER TABLE "BloodCrossmatch"
    ADD CONSTRAINT "BloodCrossmatch_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodCrossmatch_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodCrossmatch_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodCrossmatch_bloodUnitId_fkey" FOREIGN KEY ("bloodUnitId") REFERENCES "BloodUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodCrossmatch_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodCrossmatch_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_blood_crossmatch()
RETURNS TRIGGER AS $$
DECLARE
    v_pat_hosp INTEGER;
    v_enc_hosp INTEGER;
    v_enc_pat INTEGER;
    v_unit_hosp INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'BloodCrossmatch records cannot be deleted (id=%)', OLD.id;
    END IF;

    SELECT "hospitalId" INTO v_pat_hosp FROM "Patient" WHERE "id" = NEW."patientId";
    SELECT "hospitalId", "patientId" INTO v_enc_hosp, v_enc_pat FROM "Encounter" WHERE "id" = NEW."encounterId";
    SELECT "hospitalId" INTO v_unit_hosp FROM "BloodUnit" WHERE "id" = NEW."bloodUnitId";

    IF v_pat_hosp IS DISTINCT FROM NEW."hospitalId"
       OR v_enc_hosp IS DISTINCT FROM NEW."hospitalId"
       OR v_enc_pat IS DISTINCT FROM NEW."patientId"
       OR v_unit_hosp IS DISTINCT FROM NEW."hospitalId" THEN
        RAISE EXCEPTION 'BloodCrossmatch patient, encounter, and blood unit must belong to the same hospital and patient';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blood_crossmatch_guard
BEFORE INSERT OR UPDATE OR DELETE ON "BloodCrossmatch"
FOR EACH ROW EXECUTE FUNCTION guard_blood_crossmatch();

CREATE TABLE "BloodTransfusion" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "bloodUnitId" INTEGER NOT NULL,
    "crossmatchId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issuedById" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bedsideVerifier1Id" INTEGER,
    "bedsideVerified1At" TIMESTAMP(3),
    "patientBandScanned" BOOLEAN NOT NULL DEFAULT false,
    "bagBarcodeScanned" BOOLEAN NOT NULL DEFAULT false,
    "bedsideVerifier2Id" INTEGER,
    "bedsideVerified2At" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "volumeTransfusedMl" INTEGER,
    "stopReason" VARCHAR(500),
    "hasReaction" BOOLEAN NOT NULL DEFAULT false,
    "reactionType" VARCHAR(80),
    "reactionSeverity" VARCHAR(32),
    "clinicalIncidentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloodTransfusion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BloodTransfusion_status_chk" CHECK ("status" IN ('ISSUED', 'VERIFIED_BEDSIDE', 'IN_PROGRESS', 'COMPLETED', 'STOPPED_REACTION', 'RETURNED_UNUSED')),
    CONSTRAINT "BloodTransfusion_dual_verifier_chk" CHECK ("bedsideVerifier2Id" IS NULL OR "bedsideVerifier2Id" <> "bedsideVerifier1Id"),
    CONSTRAINT "BloodTransfusion_bedside_interlock_chk" CHECK (
        "status" NOT IN ('VERIFIED_BEDSIDE', 'IN_PROGRESS', 'COMPLETED')
        OR (
            "bedsideVerifier1Id" IS NOT NULL
            AND "bedsideVerified1At" IS NOT NULL
            AND "bedsideVerifier2Id" IS NOT NULL
            AND "bedsideVerified2At" IS NOT NULL
            AND "patientBandScanned" = true
            AND "bagBarcodeScanned" = true
        )
    ),
    CONSTRAINT "BloodTransfusion_volume_chk" CHECK ("volumeTransfusedMl" IS NULL OR ("volumeTransfusedMl" >= 0 AND "volumeTransfusedMl" <= 2000))
);

CREATE UNIQUE INDEX "BloodTransfusion_crossmatchId_key" ON "BloodTransfusion"("crossmatchId");
CREATE UNIQUE INDEX "BloodTransfusion_clinicalIncidentId_key" ON "BloodTransfusion"("clinicalIncidentId");
CREATE INDEX "BloodTransfusion_hospitalId_patientId_status_idx" ON "BloodTransfusion"("hospitalId", "patientId", "status");
CREATE INDEX "BloodTransfusion_hospitalId_encounterId_idx" ON "BloodTransfusion"("hospitalId", "encounterId");
CREATE INDEX "BloodTransfusion_bloodUnitId_idx" ON "BloodTransfusion"("bloodUnitId");

ALTER TABLE "BloodTransfusion"
    ADD CONSTRAINT "BloodTransfusion_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodTransfusion_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodTransfusion_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodTransfusion_bloodUnitId_fkey" FOREIGN KEY ("bloodUnitId") REFERENCES "BloodUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodTransfusion_crossmatchId_fkey" FOREIGN KEY ("crossmatchId") REFERENCES "BloodCrossmatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodTransfusion_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodTransfusion_bedsideVerifier1Id_fkey" FOREIGN KEY ("bedsideVerifier1Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodTransfusion_bedsideVerifier2Id_fkey" FOREIGN KEY ("bedsideVerifier2Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodTransfusion_clinicalIncidentId_fkey" FOREIGN KEY ("clinicalIncidentId") REFERENCES "ClinicalIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_blood_transfusion()
RETURNS TRIGGER AS $$
DECLARE
    v_cm_hosp INTEGER;
    v_cm_pat INTEGER;
    v_cm_enc INTEGER;
    v_cm_unit INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'BloodTransfusion records are permanent medical records and cannot be deleted (id=%)', OLD.id;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD."hospitalId" <> NEW."hospitalId"
           OR OLD."patientId" <> NEW."patientId"
           OR OLD."encounterId" <> NEW."encounterId"
           OR OLD."bloodUnitId" <> NEW."bloodUnitId"
           OR OLD."crossmatchId" <> NEW."crossmatchId" THEN
            RAISE EXCEPTION 'BloodTransfusion core identity fields are immutable (id=%)', OLD.id;
        END IF;

        IF OLD."status" IN ('STOPPED_REACTION', 'RETURNED_UNUSED') THEN
            RAISE EXCEPTION 'Finalized BloodTransfusion (%) cannot be modified (id=%)', OLD."status", OLD.id;
        END IF;
    END IF;

    SELECT "hospitalId", "patientId", "encounterId", "bloodUnitId"
      INTO v_cm_hosp, v_cm_pat, v_cm_enc, v_cm_unit
      FROM "BloodCrossmatch"
     WHERE "id" = NEW."crossmatchId";

    IF v_cm_hosp IS DISTINCT FROM NEW."hospitalId"
       OR v_cm_pat IS DISTINCT FROM NEW."patientId"
       OR v_cm_enc IS DISTINCT FROM NEW."encounterId"
       OR v_cm_unit IS DISTINCT FROM NEW."bloodUnitId" THEN
        RAISE EXCEPTION 'BloodTransfusion must match parent BloodCrossmatch hospital, patient, encounter, and unit';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blood_transfusion_guard
BEFORE INSERT OR UPDATE OR DELETE ON "BloodTransfusion"
FOR EACH ROW EXECUTE FUNCTION guard_blood_transfusion();

CREATE TABLE "BloodTransfusionEvent" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "transfusionId" INTEGER NOT NULL,
    "eventType" VARCHAR(40) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" INTEGER NOT NULL,
    "temperatureC" DECIMAL(4,1),
    "heartRate" INTEGER,
    "systolicBp" INTEGER,
    "diastolicBp" INTEGER,
    "respiratoryRate" INTEGER,
    "spo2" INTEGER,
    "reactionSymptoms" VARCHAR(500),
    "severity" VARCHAR(32),
    "actionTaken" VARCHAR(500),
    "notes" VARCHAR(500),

    CONSTRAINT "BloodTransfusionEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BloodTransfusionEvent_type_chk" CHECK ("eventType" IN ('PRE_TRANSFUSION_VITALS', 'FIFTEEN_MIN_VITALS', 'HOURLY_VITALS', 'POST_TRANSFUSION_VITALS', 'REACTION_REPORTED', 'TRANSFUSION_STOPPED')),
    CONSTRAINT "BloodTransfusionEvent_spo2_chk" CHECK ("spo2" IS NULL OR ("spo2" BETWEEN 0 AND 100))
);

CREATE INDEX "BloodTransfusionEvent_transfusionId_recordedAt_idx" ON "BloodTransfusionEvent"("transfusionId", "recordedAt");
CREATE INDEX "BloodTransfusionEvent_hospitalId_eventType_idx" ON "BloodTransfusionEvent"("hospitalId", "eventType");

ALTER TABLE "BloodTransfusionEvent"
    ADD CONSTRAINT "BloodTransfusionEvent_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodTransfusionEvent_transfusionId_fkey" FOREIGN KEY ("transfusionId") REFERENCES "BloodTransfusion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BloodTransfusionEvent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_blood_transfusion_event_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'BloodTransfusionEvent records are append-only hemovigilance audit logs and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blood_transfusion_event_immutable_guard
BEFORE UPDATE OR DELETE ON "BloodTransfusionEvent"
FOR EACH ROW EXECUTE FUNCTION guard_blood_transfusion_event_immutable();
