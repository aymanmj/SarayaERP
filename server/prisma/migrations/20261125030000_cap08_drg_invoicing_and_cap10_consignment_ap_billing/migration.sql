-- Migration #80: Phase 6 Batch 26
-- 1. CAP08 DRG Surgical Package Automated Discharge Invoice Linking & Insurance/Patient Split
-- 2. CAP10 Consignment Consumption Automated Supplier Billing (PENDING_BILLING -> BILLED -> PurchaseInvoice)

-- =========================================================================
-- 1. EncounterPackageEnrollment: Invoice Link + Split Shares + Hardened Guard
-- =========================================================================
ALTER TABLE "EncounterPackageEnrollment"
  ADD COLUMN "invoiceId" INTEGER,
  ADD COLUMN "insuranceShare" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "patientShare" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "invoicedAt" TIMESTAMP(3),
  ADD COLUMN "invoicedById" INTEGER;

CREATE UNIQUE INDEX "EncounterPackageEnrollment_invoiceId_key"
  ON "EncounterPackageEnrollment"("invoiceId");

ALTER TABLE "EncounterPackageEnrollment"
  ADD CONSTRAINT "EncounterPackageEnrollment_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EncounterPackageEnrollment_invoicedById_fkey"
    FOREIGN KEY ("invoicedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EncounterPackageEnrollment_invoice_link_chk" CHECK (
    "invoiceId" IS NULL
    OR (
      "status" = 'SETTLED'
      AND "invoicedAt" IS NOT NULL
      AND "invoicedById" IS NOT NULL
      AND "insuranceShare" >= 0
      AND "patientShare" >= 0
      AND ("insuranceShare" + "patientShare") = "netBillableTotal"
    )
  );

CREATE OR REPLACE FUNCTION encounter_package_enrollment_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'SETTLED' THEN
      RAISE EXCEPTION 'Settled EncounterPackageEnrollment % is immutable and cannot be deleted', OLD."id";
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'CANCELLED' THEN
      RAISE EXCEPTION 'Cancelled EncounterPackageEnrollment % is immutable', OLD."id";
    END IF;

    IF OLD."status" = 'SETTLED' THEN
      -- Allow strictly one-time atomic linking of the generated discharge Invoice
      -- while guaranteeing every financial/settlement/hash column remains untouched.
      IF OLD."invoiceId" IS NULL
         AND NEW."invoiceId" IS NOT NULL
         AND OLD."status" IS NOT DISTINCT FROM NEW."status"
         AND OLD."hospitalId" IS NOT DISTINCT FROM NEW."hospitalId"
         AND OLD."encounterId" IS NOT DISTINCT FROM NEW."encounterId"
         AND OLD."packageId" IS NOT DISTINCT FROM NEW."packageId"
         AND OLD."packagePriceSnapshot" IS NOT DISTINCT FROM NEW."packagePriceSnapshot"
         AND OLD."actualChargesTotal" IS NOT DISTINCT FROM NEW."actualChargesTotal"
         AND OLD."coveredByPackageAmount" IS NOT DISTINCT FROM NEW."coveredByPackageAmount"
         AND OLD."overageAmount" IS NOT DISTINCT FROM NEW."overageAmount"
         AND OLD."netBillableTotal" IS NOT DISTINCT FROM NEW."netBillableTotal"
         AND OLD."packageVariance" IS NOT DISTINCT FROM NEW."packageVariance"
         AND OLD."settledById" IS NOT DISTINCT FROM NEW."settledById"
         AND OLD."settledAt" IS NOT DISTINCT FROM NEW."settledAt"
         AND OLD."signatureHash" IS NOT DISTINCT FROM NEW."signatureHash" THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Finalized EncounterPackageEnrollment % is immutable', OLD."id";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- 2. ConsignmentConsumption: Supplier PurchaseInvoice Link + Hardened Guard
-- =========================================================================
ALTER TABLE "ConsignmentConsumption"
  ADD COLUMN "purchaseInvoiceId" INTEGER,
  ADD COLUMN "billedAt" TIMESTAMP(3),
  ADD COLUMN "billedById" INTEGER;

CREATE INDEX "ConsignmentConsumption_hospitalId_supplierBillStatus_idx"
  ON "ConsignmentConsumption"("hospitalId", "supplierBillStatus");
CREATE INDEX "ConsignmentConsumption_purchaseInvoiceId_idx"
  ON "ConsignmentConsumption"("purchaseInvoiceId");

ALTER TABLE "ConsignmentConsumption"
  ADD CONSTRAINT "ConsignmentConsumption_purchaseInvoiceId_fkey"
    FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentConsumption_billedById_fkey"
    FOREIGN KEY ("billedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentConsumption_billing_link_chk" CHECK (
    "supplierBillStatus" = 'PENDING_BILLING'
    OR ("purchaseInvoiceId" IS NOT NULL AND "billedAt" IS NOT NULL AND "billedById" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION guard_consignment_consumption_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ConsignmentConsumption records cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."quantity" IS DISTINCT FROM NEW."quantity"
     OR OLD."unitPrice" IS DISTINCT FROM NEW."unitPrice"
     OR OLD."totalAmount" IS DISTINCT FROM NEW."totalAmount"
     OR OLD."encounterId" IS DISTINCT FROM NEW."encounterId" THEN
    RAISE EXCEPTION 'ConsignmentConsumption financial and clinical link fields are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."supplierBillStatus" IN ('BILLED', 'SETTLED') THEN
    IF NEW."supplierBillStatus" = 'PENDING_BILLING'
       OR OLD."purchaseInvoiceId" IS DISTINCT FROM NEW."purchaseInvoiceId"
       OR OLD."billedAt" IS DISTINCT FROM NEW."billedAt"
       OR OLD."billedById" IS DISTINCT FROM NEW."billedById" THEN
      RAISE EXCEPTION 'Billed ConsignmentConsumption % cannot be unbilled or relinked', OLD."id" USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
