ALTER TABLE "PreAuthorization"
  ADD COLUMN "isPrescriptionRequest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "decisionReason" TEXT;

ALTER TABLE "Prescription"
  DROP CONSTRAINT "Prescription_authorization_requires_invoice",
  DROP CONSTRAINT "Prescription_replacement_complete",
  ADD CONSTRAINT "Prescription_authorization_requires_invoice_or_draft"
    CHECK ("preAuthorizationId" IS NULL OR "prepaidInvoiceId" IS NOT NULL OR "status" = 'DRAFT'),
  ADD CONSTRAINT "Prescription_replacement_complete"
    CHECK (
      ("replacesPrescriptionId" IS NULL AND "replacementReason" IS NULL AND "replacementFingerprint" IS NULL)
      OR (
        "replacesPrescriptionId" IS NOT NULL
        AND "replacesPrescriptionId" < "id"
        AND ("prepaidInvoiceId" IS NOT NULL OR ("status" = 'DRAFT' AND "preAuthorizationId" IS NOT NULL))
        AND "replacementReason" IS NOT NULL
        AND length(btrim("replacementReason")) >= 5
        AND "replacementFingerprint" IS NOT NULL
        AND "replacementFingerprint" ~ '^[0-9a-f]{64}$'
      )
    );
