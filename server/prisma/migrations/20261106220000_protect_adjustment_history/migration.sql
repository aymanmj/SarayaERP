BEGIN;
ALTER TABLE "InvoiceAdjustment" DROP CONSTRAINT "InvoiceAdjustment_reviewedById_fkey";
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceAdjustment" DROP CONSTRAINT "InvoiceAdjustment_postingEntryId_fkey";
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_postingEntryId_fkey" FOREIGN KEY ("postingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_review_evidence" CHECK (
 ("status" = 'PENDING' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL AND "postingEntryId" IS NULL) OR
 ("status" = 'CANCELLED' AND "reviewedById" IS NULL AND "postingEntryId" IS NULL) OR
 ("status" = 'REJECTED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "postingEntryId" IS NULL AND "reviewReason" IS NOT NULL AND length(trim("reviewReason")) >= 5) OR
 ("status" = 'POSTED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "postingEntryId" IS NOT NULL AND "reviewReason" IS NOT NULL AND length(trim("reviewReason")) >= 5)
);
COMMIT;
