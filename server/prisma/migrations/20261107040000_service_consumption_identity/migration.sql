CREATE TABLE "ServiceMaterialConsumption" (
 "id" SERIAL PRIMARY KEY, "hospitalId" INTEGER NOT NULL, "serviceItemId" INTEGER NOT NULL,
 "referenceType" TEXT NOT NULL, "referenceId" INTEGER NOT NULL, "warehouseId" INTEGER,
 "userId" INTEGER NOT NULL, "multiplier" DECIMAL(18,3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "error" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
 CONSTRAINT "consumption_status_check" CHECK ("status" IN ('PENDING','FAILED','COMPLETED')),
 CONSTRAINT "consumption_quantity_check" CHECK ("multiplier">0),
 CONSTRAINT "consumption_completion_check" CHECK (("status"='COMPLETED')=("completedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "ServiceMaterialConsumption_hospitalId_serviceItemId_referenceType_referenceId_key" ON "ServiceMaterialConsumption"("hospitalId","serviceItemId","referenceType","referenceId");
CREATE INDEX "ServiceMaterialConsumption_status_nextRetryAt_idx" ON "ServiceMaterialConsumption"("status","nextRetryAt");
