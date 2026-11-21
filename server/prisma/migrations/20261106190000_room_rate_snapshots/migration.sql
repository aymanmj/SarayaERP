BEGIN;
-- Historical rates cannot be reconstructed from today's mutable price lists.
-- Leave existing assignments unverified; no automatic financial backfill.
ALTER TABLE "BedAssignment" ADD COLUMN "roomRateSnapshot" JSONB;
ALTER TABLE "EncounterCharge" ADD COLUMN "roomAllocation" JSONB;
ALTER TABLE "EncounterCharge" ADD COLUMN "roomBillingKey" TEXT;
CREATE UNIQUE INDEX "EncounterCharge_roomBillingKey_key" ON "EncounterCharge"("roomBillingKey");
COMMIT;
