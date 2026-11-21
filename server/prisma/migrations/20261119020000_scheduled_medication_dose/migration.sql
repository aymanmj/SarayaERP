ALTER TABLE "MedicationAdministration"
    ADD COLUMN "scheduledSlot" TEXT,
    ADD COLUMN "scheduledFor" TIMESTAMP(3),
    ADD CONSTRAINT "MedicationAdministration_scheduled_fields_check"
        CHECK (("scheduledSlot" IS NULL) = ("scheduledFor" IS NULL));

CREATE INDEX "MedicationAdministration_prescriptionItemId_scheduledSlot_idx"
    ON "MedicationAdministration" ("prescriptionItemId", "scheduledSlot");

CREATE UNIQUE INDEX "MedicationAdministration_scheduled_final_unique"
    ON "MedicationAdministration" ("prescriptionItemId", "scheduledSlot")
    WHERE "scheduledSlot" IS NOT NULL AND "status" <> 'HELD';

CREATE UNIQUE INDEX "MedicationAdministration_scheduled_hold_unique"
    ON "MedicationAdministration" ("prescriptionItemId", "scheduledSlot")
    WHERE "scheduledSlot" IS NOT NULL AND "status" = 'HELD';
