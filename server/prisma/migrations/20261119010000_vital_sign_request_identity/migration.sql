ALTER TABLE "VitalSign"
    ADD COLUMN "requestKey" TEXT,
    ADD COLUMN "requestFingerprint" TEXT;

CREATE UNIQUE INDEX "VitalSign_requestKey_key" ON "VitalSign"("requestKey");
