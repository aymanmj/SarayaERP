BEGIN;
-- Keep legacy source identities unclassified for explicit reconciliation.
ALTER TABLE "AccountingEntry" ADD COLUMN "postingKey" TEXT;
CREATE UNIQUE INDEX "AccountingEntry_postingKey_key" ON "AccountingEntry"("postingKey");
ALTER TABLE "Payment" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "Payment_requestKey_key" ON "Payment"("requestKey");
COMMIT;
