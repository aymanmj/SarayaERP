CREATE TABLE "InsuranceSettlementRefund" (
  id SERIAL PRIMARY KEY,
  "hospitalId" INTEGER NOT NULL REFERENCES "Hospital"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "settlementId" INTEGER NOT NULL REFERENCES "InsuranceSettlement"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestKey" TEXT NOT NULL,
  amount DECIMAL(18,3) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 1000),
  status TEXT NOT NULL DEFAULT 'PENDING',
  "requestedById" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "reviewedById" INTEGER REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "reviewNote" TEXT,
  "bankReference" TEXT,
  "postingEntryId" INTEGER REFERENCES "AccountingEntry"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CHECK (
    (status = 'PENDING' AND "reviewedById" IS NULL AND "reviewNote" IS NULL
      AND "bankReference" IS NULL AND "postingEntryId" IS NULL AND "reviewedAt" IS NULL)
    OR (status IN ('POSTED', 'REJECTED') AND "reviewedById" IS NOT NULL
      AND "reviewedById" <> "requestedById" AND "reviewedAt" IS NOT NULL
      AND "reviewNote" IS NOT NULL AND length(btrim("reviewNote")) BETWEEN 5 AND 1000
      AND ((status = 'POSTED' AND "postingEntryId" IS NOT NULL AND "bankReference" IS NOT NULL
            AND length(btrim("bankReference")) BETWEEN 5 AND 200)
        OR (status = 'REJECTED' AND "postingEntryId" IS NULL AND "bankReference" IS NULL)))
  )
);
CREATE UNIQUE INDEX "InsuranceSettlementRefund_requestKey_key" ON "InsuranceSettlementRefund"("requestKey");
CREATE UNIQUE INDEX "InsuranceSettlementRefund_postingEntryId_key" ON "InsuranceSettlementRefund"("postingEntryId");
CREATE UNIQUE INDEX "InsuranceSettlementRefund_hospitalId_bankReference_key" ON "InsuranceSettlementRefund"("hospitalId", "bankReference");
CREATE INDEX "InsuranceSettlementRefund_settlementId_status_idx" ON "InsuranceSettlementRefund"("settlementId", status);

CREATE TABLE "InsuranceSettlementRefundLine" (
  "refundId" INTEGER NOT NULL REFERENCES "InsuranceSettlementRefund"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "allocationId" INTEGER NOT NULL REFERENCES "InsuranceSettlementAllocation"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  amount DECIMAL(18,3) NOT NULL CHECK (amount > 0),
  PRIMARY KEY ("refundId", "allocationId")
);
CREATE INDEX "InsuranceSettlementRefundLine_allocationId_idx" ON "InsuranceSettlementRefundLine"("allocationId");

CREATE FUNCTION guard_insurance_settlement_refund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Settlement refund history is immutable' USING ERRCODE = '23514';
  END IF;
  PERFORM id FROM "InsuranceSettlement" WHERE id = NEW."settlementId"
    AND "hospitalId" = NEW."hospitalId" FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM "User" WHERE id = NEW."requestedById" AND "hospitalId" = NEW."hospitalId"
  ) OR (NEW."reviewedById" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "User" WHERE id = NEW."reviewedById" AND "hospitalId" = NEW."hospitalId"
  )) THEN
    RAISE EXCEPTION 'Invalid settlement refund scope' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Settlement refund requires a pending request' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.status <> 'PENDING' OR NEW.status NOT IN ('POSTED','REJECTED')
    OR ROW(NEW.id, NEW."hospitalId", NEW."settlementId", NEW."requestKey", NEW.amount, NEW.reason, NEW."requestedById", NEW."createdAt")
      IS DISTINCT FROM ROW(OLD.id, OLD."hospitalId", OLD."settlementId", OLD."requestKey", OLD.amount, OLD.reason, OLD."requestedById", OLD."createdAt"))
  THEN
    RAISE EXCEPTION 'Settlement refund history is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER insurance_settlement_refund_guard BEFORE INSERT OR UPDATE OR DELETE ON "InsuranceSettlementRefund"
  FOR EACH ROW EXECUTE FUNCTION guard_insurance_settlement_refund();

CREATE FUNCTION guard_insurance_settlement_refund_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allocation_amount NUMERIC;
  reserved NUMERIC;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Settlement refund lines are immutable' USING ERRCODE = '23514';
  END IF;
  SELECT a.amount INTO allocation_amount FROM "InsuranceSettlementAllocation" a
    JOIN "InsuranceSettlementRefund" r ON r."settlementId" = a."settlementId"
    WHERE a.id = NEW."allocationId" AND r.id = NEW."refundId" AND r.status = 'PENDING'
    FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid refund allocation' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(SUM(l.amount), 0) INTO reserved FROM "InsuranceSettlementRefundLine" l
    JOIN "InsuranceSettlementRefund" r ON r.id = l."refundId"
    WHERE l."allocationId" = NEW."allocationId" AND r.status IN ('PENDING','POSTED');
  IF reserved + NEW.amount > allocation_amount THEN
    RAISE EXCEPTION 'Settlement refund exceeds original allocation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER insurance_settlement_refund_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "InsuranceSettlementRefundLine"
  FOR EACH ROW EXECUTE FUNCTION guard_insurance_settlement_refund_line();

CREATE FUNCTION expected_settlement_claim_status(allocation_id INTEGER) RETURNS TEXT LANGUAGE sql AS $$
  SELECT CASE WHEN refunded.amount = 0 THEN 'PAID'
    WHEN refunded.amount = a.amount THEN 'SUBMITTED' ELSE 'PARTIALLY_PAID' END
  FROM "InsuranceSettlementAllocation" a
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(l.amount), 0) AS amount FROM "InsuranceSettlementRefundLine" l
    JOIN "InsuranceSettlementRefund" r ON r.id = l."refundId"
    WHERE l."allocationId" = a.id AND r.status = 'POSTED'
  ) refunded WHERE a.id = allocation_id;
$$;

CREATE OR REPLACE FUNCTION protect_settled_insurance_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocation_id INTEGER;
BEGIN
  SELECT id INTO allocation_id FROM "InsuranceSettlementAllocation" WHERE "invoiceId" = OLD.id;
  IF FOUND AND (
    ROW(NEW."insuranceProviderId", NEW."insuranceShare", NEW."hospitalId", NEW.type)
      IS DISTINCT FROM ROW(OLD."insuranceProviderId", OLD."insuranceShare", OLD."hospitalId", OLD.type)
    OR (NEW.status = 'CANCELLED' AND OLD.status <> NEW.status)
    OR (NEW."claimStatus" IS DISTINCT FROM OLD."claimStatus"
      AND NEW."claimStatus" IS DISTINCT FROM expected_settlement_claim_status(allocation_id))
  ) THEN
    RAISE EXCEPTION 'Settled insurance invoice requires a documented correction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION verify_insurance_settlement_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE refund_id INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'InsuranceSettlementRefund' THEN
    refund_id := NEW.id;
  ELSE
    refund_id := NEW."refundId";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "InsuranceSettlementRefund" r WHERE r.id = refund_id
      AND r.amount = (SELECT SUM(l.amount) FROM "InsuranceSettlementRefundLine" l WHERE l."refundId" = r.id)
      AND (r.status <> 'POSTED' OR (
        EXISTS (SELECT 1 FROM "AccountingEntry" e WHERE e.id = r."postingEntryId"
          AND e."hospitalId" = r."hospitalId"
          AND e."postingKey" = concat('insurance-settlement-refund:', r."hospitalId", ':', r.id))
        AND r.amount = (SELECT SUM(l.debit) FROM "AccountingEntryLine" l WHERE l."entryId" = r."postingEntryId")
        AND r.amount = (SELECT SUM(l.credit) FROM "AccountingEntryLine" l WHERE l."entryId" = r."postingEntryId")
        AND NOT EXISTS (
          SELECT 1 FROM "InsuranceSettlementRefundLine" l
          JOIN "InsuranceSettlementAllocation" a ON a.id = l."allocationId"
          JOIN "Invoice" i ON i.id = a."invoiceId"
          WHERE l."refundId" = r.id AND i."claimStatus" IS DISTINCT FROM expected_settlement_claim_status(a.id)
        )
      ))
  ) THEN
    RAISE EXCEPTION 'Settlement refund must match its allocations, journal and invoice statuses' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER insurance_settlement_refund_balanced AFTER INSERT OR UPDATE ON "InsuranceSettlementRefund"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_insurance_settlement_refund();
CREATE CONSTRAINT TRIGGER insurance_settlement_refund_line_balanced AFTER INSERT ON "InsuranceSettlementRefundLine"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_insurance_settlement_refund();
