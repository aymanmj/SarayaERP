ALTER TABLE "Prescription"
  ADD COLUMN "replacesPrescriptionId" INTEGER,
  ADD COLUMN "replacementReason" TEXT,
  ADD COLUMN "replacementFingerprint" TEXT;

CREATE UNIQUE INDEX "Prescription_replacesPrescriptionId_key"
  ON "Prescription"("replacesPrescriptionId");

ALTER TABLE "Prescription"
  ADD CONSTRAINT "Prescription_replacesPrescriptionId_fkey"
    FOREIGN KEY ("replacesPrescriptionId") REFERENCES "Prescription"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Prescription_replacement_complete"
    CHECK (
      ("replacesPrescriptionId" IS NULL AND "replacementReason" IS NULL AND "replacementFingerprint" IS NULL)
      OR (
        "replacesPrescriptionId" IS NOT NULL
        AND "replacesPrescriptionId" < "id"
        AND "prepaidInvoiceId" IS NOT NULL
        AND "replacementReason" IS NOT NULL
        AND length(btrim("replacementReason")) >= 5
        AND "replacementFingerprint" IS NOT NULL
        AND "replacementFingerprint" ~ '^[0-9a-f]{64}$'
      )
    );
