CREATE TABLE "ClaimReceiptRefund" (
  id SERIAL PRIMARY KEY,
  "hospitalId" INTEGER NOT NULL REFERENCES "Hospital"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "receiptId" INTEGER NOT NULL REFERENCES "ClaimReceipt"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestKey" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  amount DECIMAL(18,3) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 1000),
  "requestedById" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "reviewedById" INTEGER REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "reviewNote" TEXT,
  "bankReference" TEXT,
  "postingEntryId" INTEGER REFERENCES "AccountingEntry"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "ClaimReceiptRefund_evidence_check" CHECK (
    (status = 'PENDING' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL AND "reviewNote" IS NULL AND "postingEntryId" IS NULL AND "bankReference" IS NULL)
    OR (
      status IN ('POSTED', 'REJECTED') AND "reviewedById" IS NOT NULL AND "reviewedById" <> "requestedById"
      AND "reviewedAt" IS NOT NULL AND "reviewNote" IS NOT NULL AND length(btrim("reviewNote")) BETWEEN 5 AND 1000
      AND ((status = 'POSTED' AND "postingEntryId" IS NOT NULL AND "bankReference" IS NOT NULL
          AND length(btrim("bankReference")) BETWEEN 5 AND 200)
        OR (status = 'REJECTED' AND "postingEntryId" IS NULL AND "bankReference" IS NULL))
    )
  )
);
CREATE UNIQUE INDEX "ClaimReceiptRefund_requestKey_key" ON "ClaimReceiptRefund"("requestKey");
CREATE UNIQUE INDEX "ClaimReceiptRefund_postingEntryId_key" ON "ClaimReceiptRefund"("postingEntryId");
CREATE UNIQUE INDEX "ClaimReceiptRefund_hospitalId_bankReference_key" ON "ClaimReceiptRefund"("hospitalId", "bankReference");
CREATE INDEX "ClaimReceiptRefund_receiptId_status_idx" ON "ClaimReceiptRefund"("receiptId", status);

CREATE FUNCTION guard_claim_receipt_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  receipt_amount DECIMAL(18,3);
  reserved NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Claim receipt refunds cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Claim receipt refund must be requested first' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD.status <> 'PENDING' OR NEW.status NOT IN ('POSTED','REJECTED') OR
    ROW(NEW.id, NEW."hospitalId", NEW."receiptId", NEW."requestKey", NEW.amount, NEW.reason, NEW."requestedById", NEW."createdAt")
      IS DISTINCT FROM ROW(OLD.id, OLD."hospitalId", OLD."receiptId", OLD."requestKey", OLD.amount, OLD.reason, OLD."requestedById", OLD."createdAt")
  ) THEN
    RAISE EXCEPTION 'Claim receipt refund history cannot be rewritten' USING ERRCODE = '23514';
  END IF;
  SELECT amount INTO receipt_amount FROM "ClaimReceipt"
    WHERE id = NEW."receiptId" AND "hospitalId" = NEW."hospitalId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim receipt refund scope is invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('PENDING', 'POSTED') THEN
    SELECT COALESCE(SUM(amount),0) INTO reserved FROM "ClaimReceiptRefund"
      WHERE "receiptId" = NEW."receiptId" AND id <> NEW.id AND status IN ('PENDING','POSTED');
    IF reserved + NEW.amount > receipt_amount THEN
      RAISE EXCEPTION 'Claim refund exceeds original receipt' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER claim_receipt_refund_guard BEFORE INSERT OR UPDATE OR DELETE ON "ClaimReceiptRefund"
  FOR EACH ROW EXECUTE FUNCTION guard_claim_receipt_refund();

CREATE OR REPLACE FUNCTION claim_receipt_balance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  gross NUMERIC;
  collected NUMERIC;
BEGIN
 SELECT COALESCE(SUM(amount),0) INTO gross FROM "ClaimReceipt"
   WHERE "claimId"=OLD.id AND "hospitalId"=OLD."hospitalId";
 SELECT gross - COALESCE(SUM(r.amount),0) INTO collected FROM "ClaimReceiptRefund" r
   JOIN "ClaimReceipt" p ON p.id = r."receiptId"
   WHERE p."claimId"=OLD.id AND p."hospitalId"=OLD."hospitalId" AND r.status='POSTED';
 IF gross>0 THEN
  IF NEW."hospitalId"<>OLD."hospitalId" OR NEW."invoiceId"<>OLD."invoiceId" OR NEW."claimedAmount"<>OLD."claimedAmount"
   OR COALESCE(NEW."paidAmount",0)<>collected OR COALESCE(NEW."adjustmentAmount",0)<>0
   OR (collected>0 AND collected<NEW."claimedAmount" AND NEW.status<>'PARTIALLY_PAID')
   OR (collected=NEW."claimedAmount" AND NEW.status<>'PAID')
   OR (collected=0 AND NEW.status IN ('PAID','PARTIALLY_PAID'))
   OR collected<0 OR collected>NEW."claimedAmount" THEN
   RAISE EXCEPTION 'Claim collection balance and status must match its immutable receipt ledger';
  END IF;
 ELSIF COALESCE(NEW."paidAmount",0)<>COALESCE(OLD."paidAmount",0) THEN
  RAISE EXCEPTION 'Claim collections require an atomic receipt and journal workflow';
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION verify_posted_claim_refund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ClaimReceipt" p
    JOIN "Claim" c ON c.id = p."claimId" AND c."hospitalId" = NEW."hospitalId"
    JOIN "AccountingEntry" e ON e.id = NEW."postingEntryId" AND e."hospitalId" = NEW."hospitalId"
    WHERE p.id = NEW."receiptId"
      AND e."postingKey" = concat('claim-refund:', NEW."hospitalId", ':', NEW.id)
      AND c."paidAmount" = (
        SELECT COALESCE(SUM(receipt.amount),0) FROM "ClaimReceipt" receipt WHERE receipt."claimId" = c.id
      ) - (
        SELECT COALESCE(SUM(refund.amount),0) FROM "ClaimReceiptRefund" refund
        JOIN "ClaimReceipt" receipt ON receipt.id = refund."receiptId"
        WHERE receipt."claimId" = c.id AND refund.status = 'POSTED'
      )
  ) THEN
    RAISE EXCEPTION 'Posted claim refund requires an atomic journal and claim balance' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER verify_posted_claim_refund AFTER UPDATE ON "ClaimReceiptRefund"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.status = 'POSTED')
  EXECUTE FUNCTION verify_posted_claim_refund();
