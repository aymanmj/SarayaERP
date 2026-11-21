ALTER TABLE "Prescription" ADD COLUMN "preAuthorizationId" INTEGER;
CREATE UNIQUE INDEX "Prescription_preAuthorizationId_key" ON "Prescription"("preAuthorizationId");
ALTER TABLE "Prescription"
  ADD CONSTRAINT "Prescription_preAuthorizationId_fkey"
    FOREIGN KEY ("preAuthorizationId") REFERENCES "PreAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Prescription_authorization_requires_invoice"
    CHECK ("preAuthorizationId" IS NULL OR "prepaidInvoiceId" IS NOT NULL);
