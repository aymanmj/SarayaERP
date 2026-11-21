ALTER TYPE "ChargeSource" ADD VALUE 'PHARMACY_PRESCRIPTION';
ALTER TABLE "Prescription" ADD COLUMN "prepaidInvoiceId" INTEGER;
ALTER TABLE "PrescriptionItem" ADD COLUMN "prepaidUnitPrice" DECIMAL(18,3);
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prepaidUnitPrice_nonnegative"
  CHECK ("prepaidUnitPrice" IS NULL OR "prepaidUnitPrice" >= 0);
CREATE UNIQUE INDEX "Prescription_prepaidInvoiceId_key" ON "Prescription"("prepaidInvoiceId");
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_prepaidInvoiceId_fkey"
  FOREIGN KEY ("prepaidInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
