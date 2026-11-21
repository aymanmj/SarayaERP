BEGIN;
ALTER TABLE "Invoice" ADD COLUMN "lineSnapshot" JSONB;
CREATE TABLE "InvoiceAdjustment" (
 "id" SERIAL PRIMARY KEY, "hospitalId" INTEGER NOT NULL REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "invoiceId" INTEGER NOT NULL REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "chargeId" INTEGER NOT NULL REFERENCES "EncounterCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestKey" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "kind" TEXT NOT NULL,
 "previousAmount" DECIMAL(18,3) NOT NULL, "correctedAmount" DECIMAL(18,3) NOT NULL, "delta" DECIMAL(18,3) NOT NULL,
 "reason" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
 "requestedById" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "reviewedById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "reviewReason" TEXT, "postingEntryId" INTEGER REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewedAt" TIMESTAMP(3),
 CONSTRAINT "InvoiceAdjustment_valid_state" CHECK ("status" IN ('PENDING','POSTED','REJECTED','CANCELLED')),
 CONSTRAINT "InvoiceAdjustment_valid_amounts" CHECK ("previousAmount" >= 0 AND "correctedAmount" >= 0 AND "delta" <> 0 AND "delta" = "correctedAmount" - "previousAmount" AND (("kind" = 'CREDIT' AND "delta" < 0) OR ("kind" = 'DEBIT' AND "delta" > 0))),
 CONSTRAINT "InvoiceAdjustment_two_people" CHECK ("reviewedById" IS NULL OR "requestedById" <> "reviewedById")
);
CREATE UNIQUE INDEX "InvoiceAdjustment_requestKey_key" ON "InvoiceAdjustment"("requestKey");
CREATE UNIQUE INDEX "InvoiceAdjustment_postingEntryId_key" ON "InvoiceAdjustment"("postingEntryId");
CREATE INDEX "InvoiceAdjustment_hospitalId_invoiceId_status_idx" ON "InvoiceAdjustment"("hospitalId","invoiceId","status");
CREATE UNIQUE INDEX "InvoiceAdjustment_one_pending_line" ON "InvoiceAdjustment"("invoiceId","chargeId") WHERE "status" = 'PENDING';
INSERT INTO "Permission" ("code", "description") VALUES
 ('billing:adjustments:request','طلب تصحيح رسوم الإقامة النقدية'),
 ('billing:adjustments:approve','اعتماد أو رفض تصحيح رسوم الإقامة النقدية')
ON CONFLICT ("code") DO NOTHING;
COMMIT;
