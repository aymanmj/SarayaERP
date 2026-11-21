BEGIN;
-- AlterTable
ALTER TABLE "CashierSession" ADD COLUMN     "countedById" INTEGER,
ADD COLUMN     "custodyReference" TEXT;

-- AddForeignKey
ALTER TABLE "CashierSession" ADD CONSTRAINT "CashierSession_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Before this migration the API allowed only the owning cashier to record a count.
-- Preserve the known recorder of existing counted sessions; monetary fields stay unchanged.
UPDATE "CashierSession" SET "countedById"="cashierId" WHERE status IN ('CLOSING','CLOSED');
ALTER TABLE "CashierSession" ADD CONSTRAINT "CashierSession_counter_controls" CHECK (
  ("status" NOT IN ('CLOSING','CLOSED') OR ("countedById" IS NOT NULL AND "countReason" IS NOT NULL AND length(btrim("countReason")) >= 5))
  AND ("status" IN ('CLOSING','CLOSED') OR ("countedById" IS NULL AND "custodyReference" IS NULL))
  AND ("countedById" IS NULL OR (("countedById"="cashierId" AND "custodyReference" IS NULL) OR ("countedById"<>"cashierId" AND "custodyReference" IS NOT NULL AND length(btrim("custodyReference")) BETWEEN 5 AND 200)))
  AND ("closedById" IS NULL OR "countedById" IS NULL OR "closedById"<>"countedById")
);
COMMIT;
