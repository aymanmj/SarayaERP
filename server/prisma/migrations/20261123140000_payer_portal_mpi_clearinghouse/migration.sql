BEGIN;

ALTER TABLE "ClaimBatch"
    ADD COLUMN "adjudicatedAt" TIMESTAMP(3),
    ADD COLUMN "adjudicatedById" INTEGER,
    ADD COLUMN "adjudicationRequestKey" TEXT,
    ADD COLUMN "approvedAmount" DECIMAL(18,3),
    ADD COLUMN "clearingChannel" TEXT NOT NULL DEFAULT 'LOCAL_CLEARINGHOUSE',
    ADD COLUMN "eraTransactionId" INTEGER,
    ADD COLUMN "rejectedClaimsCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "submissionRequestKey" TEXT;

ALTER TABLE "ClaimBatch"
    ADD CONSTRAINT "ClaimBatch_clearingChannel_check"
    CHECK ("clearingChannel" IN ('LOCAL_CLEARINGHOUSE', 'NPHIES'));

ALTER TABLE "ClaimBatch"
    ADD CONSTRAINT "ClaimBatch_approvedAmount_check"
    CHECK ("approvedAmount" IS NULL OR ("approvedAmount" >= 0 AND "approvedAmount" <= "totalAmount"));

ALTER TABLE "PreAuthorization"
    ADD COLUMN "reviewRequestKey" TEXT,
    ADD COLUMN "reviewedAt" TIMESTAMP(3),
    ADD COLUMN "reviewedById" INTEGER;

CREATE UNIQUE INDEX "ClaimBatch_submissionRequestKey_key"
    ON "ClaimBatch"("submissionRequestKey");

CREATE UNIQUE INDEX "ClaimBatch_adjudicationRequestKey_key"
    ON "ClaimBatch"("adjudicationRequestKey");

CREATE UNIQUE INDEX "ClaimBatch_eraTransactionId_key"
    ON "ClaimBatch"("eraTransactionId");

CREATE UNIQUE INDEX "PreAuthorization_reviewRequestKey_key"
    ON "PreAuthorization"("reviewRequestKey");

ALTER TABLE "PreAuthorization"
    ADD CONSTRAINT "PreAuthorization_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClaimBatch"
    ADD CONSTRAINT "ClaimBatch_adjudicatedById_fkey"
    FOREIGN KEY ("adjudicatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClaimBatch"
    ADD CONSTRAINT "ClaimBatch_eraTransactionId_fkey"
    FOREIGN KEY ("eraTransactionId") REFERENCES "ERATransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION guard_claim_batch_closed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('SUBMITTED', 'CLOSED') THEN
            RAISE EXCEPTION 'Submitted or closed claim batch cannot be deleted' USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status = 'CLOSED' THEN
        RAISE EXCEPTION 'Closed claim batch is immutable' USING ERRCODE = '23514';
    END IF;

    IF NEW.status = 'CLOSED' AND (
        NEW."adjudicationRequestKey" IS NULL
        OR NEW."adjudicatedById" IS NULL
        OR NEW."adjudicatedAt" IS NULL
        OR NEW."eraTransactionId" IS NULL
    ) THEN
        RAISE EXCEPTION 'Closing claim batch requires adjudicator, timestamp, request key and generated ERA' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER claim_batch_closed_guard
    BEFORE UPDATE OR DELETE ON "ClaimBatch"
    FOR EACH ROW EXECUTE FUNCTION guard_claim_batch_closed();

COMMIT;
