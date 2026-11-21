ALTER TABLE "StockIssue"
  ADD COLUMN "transferVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "requestKey" UUID,
  ADD COLUMN "requestFingerprint" TEXT;
CREATE UNIQUE INDEX "StockIssue_hospitalId_requestKey_key" ON "StockIssue"("hospitalId", "requestKey");
ALTER TABLE "StockIssueItem"
  ADD COLUMN "unitCost" DECIMAL(18,3),
  ADD COLUMN "totalCost" DECIMAL(18,3),
  ADD COLUMN "batchUnitCost" DECIMAL(18,3);
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_transfer_identity_check"
  CHECK ("transferVersion" = 0 OR ("transferVersion" = 1 AND "requestKey" IS NOT NULL AND "requestFingerprint" IS NOT NULL));
ALTER TABLE "StockIssueItem" ADD CONSTRAINT "StockIssueItem_transfer_cost_check"
  CHECK (("unitCost" IS NULL AND "totalCost" IS NULL AND "batchUnitCost" IS NULL) OR
    ("unitCost" IS NOT NULL AND "totalCost" IS NOT NULL AND "batchUnitCost" IS NOT NULL
     AND "unitCost" >= 0 AND "totalCost" >= 0 AND "batchUnitCost" >= 0 AND "issuedQty" > 0
     AND "baseQuantity" = "issuedQty" AND "totalCost" = ROUND("unitCost" * "issuedQty", 3)));
