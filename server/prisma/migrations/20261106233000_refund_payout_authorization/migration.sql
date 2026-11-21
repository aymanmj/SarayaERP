BEGIN;
-- AlterTable
ALTER TABLE "InvoiceRefund" ADD COLUMN     "assignedExecutorId" INTEGER,
ADD COLUMN     "claimRequestKey" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "releaseReason" TEXT,
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "releasedById" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRefund_claimRequestKey_key" ON "InvoiceRefund"("claimRequestKey");

-- AddForeignKey
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_assignedExecutorId_fkey" FOREIGN KEY ("assignedExecutorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceRefund" DROP CONSTRAINT "InvoiceRefund_valid_state";
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_valid_state" CHECK ("amount" > 0 AND "method" IN ('CASH','CARD','TRANSFER') AND "status" IN ('PENDING','APPROVED','DISBURSING','EXECUTED','REJECTED','CANCELLED') AND ("reviewedById" IS NULL OR "reviewedById" <> "requestedById") AND ("executedById" IS NULL OR "executedById" <> "reviewedById") AND ("status" NOT IN ('APPROVED','DISBURSING','EXECUTED') OR ("reviewedById" IS NOT NULL AND "approvedAt" IS NOT NULL)) AND ("status" <> 'EXECUTED' OR ("executedById" IS NOT NULL AND "executedAt" IS NOT NULL AND "executionReference" IS NOT NULL AND "executionEvidence" IS NOT NULL AND "executionKey" IS NOT NULL AND "executionRequestKey" IS NOT NULL AND "postingEntryId" IS NOT NULL AND ("method" <> 'CASH' OR "sessionId" IS NOT NULL))) AND ("status" = 'EXECUTED' OR ("executedById" IS NULL AND "executedAt" IS NULL AND "postingEntryId" IS NULL)));

ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_payout_controls" CHECK (
 ("status" NOT IN ('DISBURSING','EXECUTED') OR ("assignedExecutorId" IS NOT NULL AND "claimedAt" IS NOT NULL AND "claimRequestKey" IS NOT NULL AND "assignedExecutorId" <> "reviewedById" AND ("method" <> 'CASH' OR "sessionId" IS NOT NULL)))
 AND ("status" <> 'EXECUTED' OR "executedById" = "assignedExecutorId")
 AND ("releasedById" IS NULL OR ("status" = 'CANCELLED' AND "releasedById" = "reviewedById" AND "releasedById" <> "assignedExecutorId" AND "releaseReason" IS NOT NULL AND "releasedAt" IS NOT NULL))
);

COMMIT;
